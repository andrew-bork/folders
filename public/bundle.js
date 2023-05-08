(function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
        let children = target.childNodes;
        // If target is <head>, there may be children without claim_order
        if (target.nodeName === 'HEAD') {
            const myChildren = [];
            for (let i = 0; i < children.length; i++) {
                const node = children[i];
                if (node.claim_order !== undefined) {
                    myChildren.push(node);
                }
            }
            children = myChildren;
        }
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            // with fast path for when we are on the current longest subsequence
            const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append_hydration(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
                target.actual_end_child = target.firstChild;
            }
            // Skip nodes of undefined ordering
            while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
                target.actual_end_child = target.actual_end_child.nextSibling;
            }
            if (node !== target.actual_end_child) {
                // We only insert if the ordering of this node should be modified or the parent node is not target
                if (node.claim_order !== undefined || node.parentNode !== target) {
                    target.insertBefore(node, target.actual_end_child);
                }
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target || node.nextSibling !== null) {
            target.appendChild(node);
        }
    }
    function insert_hydration(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append_hydration(target, node);
        }
        else if (node.parentNode !== target || node.nextSibling != anchor) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function init_claim_info(nodes) {
        if (nodes.claim_info === undefined) {
            nodes.claim_info = { last_index: 0, total_claimed: 0 };
        }
    }
    function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
        // Try to find nodes in an order such that we lengthen the longest increasing subsequence
        init_claim_info(nodes);
        const resultNode = (() => {
            // We first try to find an element after the previous one
            for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
                const node = nodes[i];
                if (predicate(node)) {
                    const replacement = processNode(node);
                    if (replacement === undefined) {
                        nodes.splice(i, 1);
                    }
                    else {
                        nodes[i] = replacement;
                    }
                    if (!dontUpdateLastIndex) {
                        nodes.claim_info.last_index = i;
                    }
                    return node;
                }
            }
            // Otherwise, we try to find one before
            // We iterate in reverse so that we don't go too far back
            for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
                const node = nodes[i];
                if (predicate(node)) {
                    const replacement = processNode(node);
                    if (replacement === undefined) {
                        nodes.splice(i, 1);
                    }
                    else {
                        nodes[i] = replacement;
                    }
                    if (!dontUpdateLastIndex) {
                        nodes.claim_info.last_index = i;
                    }
                    else if (replacement === undefined) {
                        // Since we spliced before the last_index, we decrease it
                        nodes.claim_info.last_index--;
                    }
                    return node;
                }
            }
            // If we can't find any matching node, we create a new one
            return createNode();
        })();
        resultNode.claim_order = nodes.claim_info.total_claimed;
        nodes.claim_info.total_claimed += 1;
        return resultNode;
    }
    function claim_element_base(nodes, name, attributes, create_element) {
        return claim_node(nodes, (node) => node.nodeName === name, (node) => {
            const remove = [];
            for (let j = 0; j < node.attributes.length; j++) {
                const attribute = node.attributes[j];
                if (!attributes[attribute.name]) {
                    remove.push(attribute.name);
                }
            }
            remove.forEach(v => node.removeAttribute(v));
            return undefined;
        }, () => create_element(name));
    }
    function claim_element(nodes, name, attributes) {
        return claim_element_base(nodes, name, attributes, element);
    }
    function claim_text(nodes, data) {
        return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
            const dataStr = '' + data;
            if (node.data.startsWith(dataStr)) {
                if (node.data.length !== dataStr.length) {
                    return node.splitText(dataStr.length);
                }
            }
            else {
                node.data = dataStr;
            }
        }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
        );
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        text.data = data;
    }
    function set_style(node, key, value, important) {
        if (value === null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function claim_component(block, parent_nodes) {
        block && block.l(parent_nodes);
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0 && stop) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    function createDropdownStore() {
        /** @type {{x: number, y: number, options: [{name: string, execute: () => {}}], show: boolean}} */
        const bruh = {x: 0, y: 0, options: [], show: false};
        const store = writable(bruh);
        const { set, update, subscribe } = store;

        const self = {
            subscribe,

            /**
             * 
             * @param {number} x 
             * @param {number} y 
             * @param {[{name: string, execute: () => {}}]} options 
             */
            showDropdown(x, y, options) {
                set({x, y, options, show: true});
            },

            hideDropdown() {
                update((current) => {
                    current.show = false;
                    return current;
                });
            }
        };

        return self;
    }

    const Dropdown = createDropdownStore();

    /* src\frontend\components\DropdownOptions.svelte generated by Svelte v3.58.0 */

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	return child_ctx;
    }

    // (17:0) {#if show}
    function create_if_block$3(ctx) {
    	let ul;
    	let mounted;
    	let dispose;
    	let each_value = /*options*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l(nodes) {
    			ul = claim_element(nodes, "UL", { class: true });
    			var ul_nodes = children(ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(ul_nodes);
    			}

    			ul_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(ul, "class", "svelte-kvdpuo");
    			set_style(ul, "top", /*y*/ ctx[3] + "px");
    			set_style(ul, "left", /*x*/ ctx[2] + "px");
    		},
    		m(target, anchor) {
    			insert_hydration(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ul, null);
    				}
    			}

    			if (!mounted) {
    				dispose = listen(ul, "click", click_handler_1);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*options*/ 1) {
    				each_value = /*options*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*y*/ 8) {
    				set_style(ul, "top", /*y*/ ctx[3] + "px");
    			}

    			if (dirty & /*x*/ 4) {
    				set_style(ul, "left", /*x*/ ctx[2] + "px");
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (20:4) {#each options as option}
    function create_each_block$2(ctx) {
    	let li;
    	let button;
    	let t_value = /*option*/ ctx[5].name + "";
    	let t;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			li = element("li");
    			button = element("button");
    			t = text(t_value);
    			this.h();
    		},
    		l(nodes) {
    			li = claim_element(nodes, "LI", { class: true });
    			var li_nodes = children(li);
    			button = claim_element(li_nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);
    			t = claim_text(button_nodes, t_value);
    			button_nodes.forEach(detach);
    			li_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(button, "class", "svelte-kvdpuo");
    			attr(li, "class", "svelte-kvdpuo");
    		},
    		m(target, anchor) {
    			insert_hydration(target, li, anchor);
    			append_hydration(li, button);
    			append_hydration(button, t);

    			if (!mounted) {
    				dispose = listen(button, "click", function () {
    					if (is_function(/*option*/ ctx[5].execute)) /*option*/ ctx[5].execute.apply(this, arguments);
    				});

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*options*/ 1 && t_value !== (t_value = /*option*/ ctx[5].name + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let if_block = /*show*/ ctx[1] && create_if_block$3(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration(target, if_block_anchor, anchor);

    			if (!mounted) {
    				dispose = listen(window, "click", /*click_handler*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*show*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    const click_handler_1 = e => {
    	e.preventDefault();
    	e.stopPropagation();
    	return false;
    };

    function instance$8($$self, $$props, $$invalidate) {
    	let { options = [
    		{
    			name: "Change View 1",
    			execute: () => {
    				
    			}
    		},
    		{
    			name: "Change View 2",
    			execute: () => {
    				
    			}
    		},
    		{
    			name: "Change View 3",
    			execute: () => {
    				
    			}
    		},
    		{
    			name: "Change View 4",
    			execute: () => {
    				
    			}
    		},
    		{
    			name: "Change View 5",
    			execute: () => {
    				
    			}
    		},
    		{
    			name: "Change View 6 loooooooooooooong",
    			execute: () => {
    				
    			}
    		}
    	] } = $$props;

    	let { show = true } = $$props;
    	let { x = 0 } = $$props;
    	let { y = 0 } = $$props;

    	const click_handler = e => {
    		Dropdown.hideDropdown();
    	};

    	$$self.$$set = $$props => {
    		if ('options' in $$props) $$invalidate(0, options = $$props.options);
    		if ('show' in $$props) $$invalidate(1, show = $$props.show);
    		if ('x' in $$props) $$invalidate(2, x = $$props.x);
    		if ('y' in $$props) $$invalidate(3, y = $$props.y);
    	};

    	return [options, show, x, y, click_handler];
    }

    class DropdownOptions extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$9, safe_not_equal, { options: 0, show: 1, x: 2, y: 3 });
    	}
    }

    const Path = {
        clean(path) {
            if(path.length === 0) return path;
            if(path[0] === "/") path = path.substring(1);
            if(path[path.length-1] === "/") path = path.subtring(0, path.length-1);
            return path;
        },

        join(path1, path2) {
            path1 = Path.clean(path1);
            path2 = Path.clean(path2);
            if(path1.length === 0) return path2;
            if(path2.length === 0) return path1;

            return path1 + "/" + path2;
        },
        /**
         * 
         * @param {string} path1 
         * @param {string} path2 
         * @param {string} path3 
         */
        replace(path, search, replace) {
            path = Path.clean(path);
            search = Path.clean(search);
            replace = Path.clean(replace);
            
            return path.replace(search, replace);
        },
        /**
         * 
         * @param {string} path 
         */
        lastPathFragment(path) {
            path = Path.clean(path);
            const i = path.lastIndexOf("/");
            if(i == -1) return path;
            return path.substring(i+1);
        },
        /**
         * 
         * @param {string} path 
         */
        parent(path) {
            path = Path.clean(path);
            const i = path.lastIndexOf("/");
            if(i == -1) return "";
            return path.substring(0, i);
        },

        /**
         * 
         * @param {string} path 
         */
        fragments(path) {
            path = Path.clean(path);
            return path.split("/");
        }
    };

    function setupDirectoryStore() {
        // /** @type {{base: string, directories: [Directory], openedFile: Entry}} */

        /** @type {{base: string, opened: [string], openedEntries: [Entry]}} */
        const bruh = {
            base: "",
            opened: [],
            openedEntries: [],
            // directories: [],
            // openedFile: null,
        };

        const store = writable(bruh);
        const { subscribe, set, update,  } = store;

        window.api.registerWatchListener(
            (eType, filename) => {
                // console.log(eType, filename);
                if(eType === "rename")
                    self.reload();
        });

        const self = {
            subscribe,
            /**
             * 
             * @param {string} entry 
             * @param {number} i 
             */
            open: (name, i) => {
                // console.log(entry, i);

                update((current) => {
                    current.opened = current.opened.slice(0, i);
                    current.opened.push(name);

                    self.reload();
                    return current;
                });
            },
            /**
             * 
             * @param {number} i 
             */
            close: (i) => {
                update((current) => {
                    current.opened = current.opened.slice(0, i);
                    self.reload();
                    return current;
                });
            },
            /**
             * 
             */
            reload: async () => {
                const current = get_store_value(store);

                let accum = "";
                const paths = current.opened.map((curr) => {
                    accum = Path.join(accum, curr);
                    return accum;
                });

                current.openedEntries = (await Promise.all(paths.map(
                    /**
                     * 
                     * @param {settings} path 
                     * @returns {Promise<Entry>}
                     */
                    async (path) => {
                        try{
                            const stat = await window.api.stat(path);
                            stat.name = Path.lastPathFragment(stat.path);
                            stat.entries = [];
                            if(stat.isDirectory) stat.entries = await window.api.readdir(path);
                            return stat;
                        }catch(e) {
                            return null;
                        }
                    }
                ))).filter((entry) => entry !== null);


                set(current);
            },
            
            move: () => {},
            /**
             * 
             * @param {string} newBase 
             */
            setBase: (newBase) => {
                set({
                    base: newBase,
                    opened: [newBase],
                    openedEntries: [],
                });

                self.reload();
                // window.api.watch(newBase);
            },
            rename: async (oldPath, newPath) => {

                update(
                    (current) => {
                        if(Path.parent(oldPath) === Path.parent(newPath)) {
                            const newName = Path.lastPathFragment(newPath);
                            
                            let accum = "";
                            current.opened = current.opened.map((curr) => {
                                accum = Path.join(accum, curr);
                                if(accum === oldPath) return newName;
                                return curr;
                            });
            
                        }else {
                            let accum = "";
                            const i = current.opened.findIndex((curr) => {
                                accum = Path.join(accum, curr);
                                return accum === oldPath;
                            });
                            if(i !== -1) current.opened = current.opened.slice(0, i);
                            return current;
                        }
            
                        console.log(oldPath, newPath);
                        console.log(Path.parent(oldPath), Path.parent(newPath));
                    
                        console.log(current);

                        return current;
                    });

                await window.api.rename(oldPath, newPath)
                    .then((a) => {
                        if(a) {
                            alert("No perms");
                        }
                        // reload();
                    });
                
                self.reload();
            },
            async mkdir(name) {
                await window.api.mkdir(name);
                // setTimeout(() => {self.reload();}, 100);
                self.reload();
            },
            async trash(name) {
                update((current) => {
                    let accum = "";
                    const i = current.opened.findIndex((curr) => {
                        accum = Path.join(accum, curr);
                        return accum === name;
                    });
                    if(i !== -1) current.opened = current.opened.slice(0, i);
                    return current;
                });

                await window.api.trash(name);
                self.reload();
            }
        };

        return self;
    }

    function setupSelectionStore() {
        const bruh = new Set();
        const store = writable(bruh);
        const { subscribe, set, update } = store;

        const self = {
            subscribe,
            deselect(path) {
                update((set) => {
                    set.delete(path);
                    return set;
                });
            },
            select(path) {
                update((set) => {
                    set.add(path);
                    return set;
                });
            },
            clear() {
                update((set) => {
                    set.clear();
                    return set;
                });
            },
            toggle(path) {
                update((set) => {
                    if(set.has(path)) set.delete(path);
                    else set.add(path);
                    return set;
                });
            },
            singleSelect(path) {
                update((set) => {
                    set.clear();
                    set.add(path);
                    return set;
                });
            }
        };
        
        return self;
    }

    const Directory = setupDirectoryStore();

    const EntrySelection = setupSelectionStore();

    let associations = null;
    window.api.loadAssociations().then(res => {associations = res; console.log(res);});
    function getAssociation(extension) {
        return associations.extensions[extension];
    }


    function getType(extension) {
        if(extension in associations.type) return associations.type[extension];
        return "file.binary";
    }

    /* src\frontend\components\RightResizeArea.svelte generated by Svelte v3.58.0 */

    function create_fragment$8(ctx) {
    	let div;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			children(div).forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "right-resize svelte-brln5i");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(window, "mousemove", /*mousemove_handler*/ ctx[4]),
    					listen(window, "mouseup", /*mouseup_handler*/ ctx[5]),
    					listen(div, "mousedown", /*mousedown_handler*/ ctx[6])
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { parent } = $$props;
    	let { width = 200 } = $$props;
    	let { minWidth = 200 } = $$props;
    	let resizing = false;

    	const mousemove_handler = e => {
    		if (resizing) {
    			const rect = parent.getBoundingClientRect();
    			$$invalidate(1, width = Math.max(minWidth, e.clientX - rect.x));
    			$$invalidate(0, parent.style.minWidth = `${width}px`, parent);
    			e.preventDefault();
    			e.stopPropagation();
    			return false;
    		}
    	};

    	const mouseup_handler = e => {
    		$$invalidate(3, resizing = false);
    	};

    	const mousedown_handler = e => {
    		$$invalidate(3, resizing = true);
    		e.stopPropagation();
    	};

    	$$self.$$set = $$props => {
    		if ('parent' in $$props) $$invalidate(0, parent = $$props.parent);
    		if ('width' in $$props) $$invalidate(1, width = $$props.width);
    		if ('minWidth' in $$props) $$invalidate(2, minWidth = $$props.minWidth);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*parent, width*/ 3) {
    			if (parent) $$invalidate(0, parent.style.minWidth = `${width}px`, parent);
    		}
    	};

    	return [
    		parent,
    		width,
    		minWidth,
    		resizing,
    		mousemove_handler,
    		mouseup_handler,
    		mousedown_handler
    	];
    }

    class RightResizeArea extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$8, safe_not_equal, { parent: 0, width: 1, minWidth: 2 });
    	}
    }

    /* src\frontend\components\filestats.svelte generated by Svelte v3.58.0 */

    function create_if_block$2(ctx) {
    	let tr;
    	let th;
    	let t0;
    	let t1;
    	let td;
    	let t2;
    	let t3;
    	let t4;

    	return {
    		c() {
    			tr = element("tr");
    			th = element("th");
    			t0 = text("Dimensions");
    			t1 = space();
    			td = element("td");
    			t2 = text(/*imageWidth*/ ctx[4]);
    			t3 = text("x");
    			t4 = text(/*imageHeight*/ ctx[5]);
    			this.h();
    		},
    		l(nodes) {
    			tr = claim_element(nodes, "TR", {});
    			var tr_nodes = children(tr);
    			th = claim_element(tr_nodes, "TH", { class: true });
    			var th_nodes = children(th);
    			t0 = claim_text(th_nodes, "Dimensions");
    			th_nodes.forEach(detach);
    			t1 = claim_space(tr_nodes);
    			td = claim_element(tr_nodes, "TD", {});
    			var td_nodes = children(td);
    			t2 = claim_text(td_nodes, /*imageWidth*/ ctx[4]);
    			t3 = claim_text(td_nodes, "x");
    			t4 = claim_text(td_nodes, /*imageHeight*/ ctx[5]);
    			td_nodes.forEach(detach);
    			tr_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(th, "class", "svelte-24zu73");
    		},
    		m(target, anchor) {
    			insert_hydration(target, tr, anchor);
    			append_hydration(tr, th);
    			append_hydration(th, t0);
    			append_hydration(tr, t1);
    			append_hydration(tr, td);
    			append_hydration(td, t2);
    			append_hydration(td, t3);
    			append_hydration(td, t4);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*imageWidth*/ 16) set_data(t2, /*imageWidth*/ ctx[4]);
    			if (dirty & /*imageHeight*/ 32) set_data(t4, /*imageHeight*/ ctx[5]);
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	let div;
    	let span0;
    	let t0_value = /*file*/ ctx[0].name + "";
    	let t0;
    	let br;
    	let t1;
    	let span1;
    	let t2_value = /*file*/ ctx[0].path + "";
    	let t2;
    	let t3;
    	let table;
    	let tr0;
    	let th0;
    	let t4;
    	let t5;
    	let td0;
    	let t6_value = /*formatBytes*/ ctx[7](/*file*/ ctx[0].size) + "";
    	let t6;
    	let t7;
    	let tr1;
    	let th1;
    	let t8;
    	let t9;
    	let td1;
    	let t10;
    	let t11;
    	let tr2;
    	let th2;
    	let t12;
    	let t13;
    	let td2;
    	let t14;
    	let t15;
    	let t16;
    	let t17;
    	let t18;
    	let t19;
    	let if_block = /*isImage*/ ctx[6] && create_if_block$2(ctx);

    	return {
    		c() {
    			div = element("div");
    			span0 = element("span");
    			t0 = text(t0_value);
    			br = element("br");
    			t1 = space();
    			span1 = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			table = element("table");
    			tr0 = element("tr");
    			th0 = element("th");
    			t4 = text("Size");
    			t5 = space();
    			td0 = element("td");
    			t6 = text(t6_value);
    			t7 = space();
    			tr1 = element("tr");
    			th1 = element("th");
    			t8 = text("Encoding");
    			t9 = space();
    			td1 = element("td");
    			t10 = text(/*type*/ ctx[3]);
    			t11 = space();
    			tr2 = element("tr");
    			th2 = element("th");
    			t12 = text("File Type");
    			t13 = space();
    			td2 = element("td");
    			t14 = text("(");
    			t15 = text(/*extension*/ ctx[2]);
    			t16 = text(") \"");
    			t17 = text(/*association*/ ctx[1]);
    			t18 = text("\"");
    			t19 = space();
    			if (if_block) if_block.c();
    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			span0 = claim_element(div_nodes, "SPAN", { class: true });
    			var span0_nodes = children(span0);
    			t0 = claim_text(span0_nodes, t0_value);
    			span0_nodes.forEach(detach);
    			br = claim_element(div_nodes, "BR", {});
    			t1 = claim_space(div_nodes);
    			span1 = claim_element(div_nodes, "SPAN", {});
    			var span1_nodes = children(span1);
    			t2 = claim_text(span1_nodes, t2_value);
    			span1_nodes.forEach(detach);
    			t3 = claim_space(div_nodes);
    			table = claim_element(div_nodes, "TABLE", { class: true });
    			var table_nodes = children(table);
    			tr0 = claim_element(table_nodes, "TR", {});
    			var tr0_nodes = children(tr0);
    			th0 = claim_element(tr0_nodes, "TH", { class: true });
    			var th0_nodes = children(th0);
    			t4 = claim_text(th0_nodes, "Size");
    			th0_nodes.forEach(detach);
    			t5 = claim_space(tr0_nodes);
    			td0 = claim_element(tr0_nodes, "TD", {});
    			var td0_nodes = children(td0);
    			t6 = claim_text(td0_nodes, t6_value);
    			td0_nodes.forEach(detach);
    			tr0_nodes.forEach(detach);
    			t7 = claim_space(table_nodes);
    			tr1 = claim_element(table_nodes, "TR", {});
    			var tr1_nodes = children(tr1);
    			th1 = claim_element(tr1_nodes, "TH", { class: true });
    			var th1_nodes = children(th1);
    			t8 = claim_text(th1_nodes, "Encoding");
    			th1_nodes.forEach(detach);
    			t9 = claim_space(tr1_nodes);
    			td1 = claim_element(tr1_nodes, "TD", {});
    			var td1_nodes = children(td1);
    			t10 = claim_text(td1_nodes, /*type*/ ctx[3]);
    			td1_nodes.forEach(detach);
    			tr1_nodes.forEach(detach);
    			t11 = claim_space(table_nodes);
    			tr2 = claim_element(table_nodes, "TR", {});
    			var tr2_nodes = children(tr2);
    			th2 = claim_element(tr2_nodes, "TH", { class: true });
    			var th2_nodes = children(th2);
    			t12 = claim_text(th2_nodes, "File Type");
    			th2_nodes.forEach(detach);
    			t13 = claim_space(tr2_nodes);
    			td2 = claim_element(tr2_nodes, "TD", {});
    			var td2_nodes = children(td2);
    			t14 = claim_text(td2_nodes, "(");
    			t15 = claim_text(td2_nodes, /*extension*/ ctx[2]);
    			t16 = claim_text(td2_nodes, ") \"");
    			t17 = claim_text(td2_nodes, /*association*/ ctx[1]);
    			t18 = claim_text(td2_nodes, "\"");
    			td2_nodes.forEach(detach);
    			tr2_nodes.forEach(detach);
    			t19 = claim_space(table_nodes);
    			if (if_block) if_block.l(table_nodes);
    			table_nodes.forEach(detach);
    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(span0, "class", "title svelte-24zu73");
    			attr(th0, "class", "svelte-24zu73");
    			attr(th1, "class", "svelte-24zu73");
    			attr(th2, "class", "svelte-24zu73");
    			attr(table, "class", "svelte-24zu73");
    			attr(div, "class", "svelte-24zu73");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);
    			append_hydration(div, span0);
    			append_hydration(span0, t0);
    			append_hydration(div, br);
    			append_hydration(div, t1);
    			append_hydration(div, span1);
    			append_hydration(span1, t2);
    			append_hydration(div, t3);
    			append_hydration(div, table);
    			append_hydration(table, tr0);
    			append_hydration(tr0, th0);
    			append_hydration(th0, t4);
    			append_hydration(tr0, t5);
    			append_hydration(tr0, td0);
    			append_hydration(td0, t6);
    			append_hydration(table, t7);
    			append_hydration(table, tr1);
    			append_hydration(tr1, th1);
    			append_hydration(th1, t8);
    			append_hydration(tr1, t9);
    			append_hydration(tr1, td1);
    			append_hydration(td1, t10);
    			append_hydration(table, t11);
    			append_hydration(table, tr2);
    			append_hydration(tr2, th2);
    			append_hydration(th2, t12);
    			append_hydration(tr2, t13);
    			append_hydration(tr2, td2);
    			append_hydration(td2, t14);
    			append_hydration(td2, t15);
    			append_hydration(td2, t16);
    			append_hydration(td2, t17);
    			append_hydration(td2, t18);
    			append_hydration(table, t19);
    			if (if_block) if_block.m(table, null);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*file*/ 1 && t0_value !== (t0_value = /*file*/ ctx[0].name + "")) set_data(t0, t0_value);
    			if (dirty & /*file*/ 1 && t2_value !== (t2_value = /*file*/ ctx[0].path + "")) set_data(t2, t2_value);
    			if (dirty & /*file*/ 1 && t6_value !== (t6_value = /*formatBytes*/ ctx[7](/*file*/ ctx[0].size) + "")) set_data(t6, t6_value);
    			if (dirty & /*type*/ 8) set_data(t10, /*type*/ ctx[3]);
    			if (dirty & /*extension*/ 4) set_data(t15, /*extension*/ ctx[2]);
    			if (dirty & /*association*/ 2) set_data(t17, /*association*/ ctx[1]);

    			if (/*isImage*/ ctx[6]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					if_block.m(table, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    		}
    	};
    }

    const KB = 1024;

    function instance$6($$self, $$props, $$invalidate) {
    	let { file } = $$props;
    	let { association } = $$props;
    	let { extension } = $$props;
    	let { type } = $$props;
    	let { imageWidth } = $$props;
    	let { imageHeight } = $$props;
    	let { isImage } = $$props;
    	let { isText } = $$props;
    	const MB = KB * KB;
    	const GB = KB * MB;
    	const TB = KB * GB;
    	const PB = KB * TB;

    	function formatBytes(size) {
    		if (size < KB) {
    			return `${size} bytes`;
    		} else if (size < MB) {
    			return `${(size / KB).toFixed(1)} KB`;
    		} else if (size < GB) {
    			return `${(size / MB).toFixed(1)} MB`;
    		} else if (size < TB) {
    			return `${(size / GB).toFixed(1)} GB`;
    		} else if (size < PB) {
    			return `${(size / TB).toFixed(1)} TB`;
    		} else {
    			return `${(size / PB).toFixed(1)} PB`;
    		}
    	}

    	$$self.$$set = $$props => {
    		if ('file' in $$props) $$invalidate(0, file = $$props.file);
    		if ('association' in $$props) $$invalidate(1, association = $$props.association);
    		if ('extension' in $$props) $$invalidate(2, extension = $$props.extension);
    		if ('type' in $$props) $$invalidate(3, type = $$props.type);
    		if ('imageWidth' in $$props) $$invalidate(4, imageWidth = $$props.imageWidth);
    		if ('imageHeight' in $$props) $$invalidate(5, imageHeight = $$props.imageHeight);
    		if ('isImage' in $$props) $$invalidate(6, isImage = $$props.isImage);
    		if ('isText' in $$props) $$invalidate(8, isText = $$props.isText);
    	};

    	return [
    		file,
    		association,
    		extension,
    		type,
    		imageWidth,
    		imageHeight,
    		isImage,
    		formatBytes,
    		isText
    	];
    }

    class Filestats extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$6, create_fragment$7, safe_not_equal, {
    			file: 0,
    			association: 1,
    			extension: 2,
    			type: 3,
    			imageWidth: 4,
    			imageHeight: 5,
    			isImage: 6,
    			isText: 8
    		});
    	}
    }

    /* src\frontend\views\file-items\TextFileItem.svelte generated by Svelte v3.58.0 */

    function create_fragment$6(ctx) {
    	let div;
    	let pre;
    	let t0;
    	let t1;
    	let t2;

    	return {
    		c() {
    			div = element("div");
    			pre = element("pre");
    			t0 = text("");
    			t1 = text(/*textContent*/ ctx[0]);
    			t2 = text("\r\n    ");
    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			pre = claim_element(div_nodes, "PRE", { class: true });
    			var pre_nodes = children(pre);
    			t0 = claim_text(pre_nodes, "");
    			t1 = claim_text(pre_nodes, /*textContent*/ ctx[0]);
    			t2 = claim_text(pre_nodes, "\r\n    ");
    			pre_nodes.forEach(detach);
    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(pre, "class", "svelte-fhjrg4");
    			attr(div, "class", "svelte-fhjrg4");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);
    			append_hydration(div, pre);
    			append_hydration(pre, t0);
    			append_hydration(pre, t1);
    			append_hydration(pre, t2);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*textContent*/ 1) set_data(t1, /*textContent*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { file } = $$props;
    	let textContent = "";

    	$$self.$$set = $$props => {
    		if ('file' in $$props) $$invalidate(1, file = $$props.file);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*file*/ 2) {
    			window.api.read(file.path).then(_text => {
    				$$invalidate(0, textContent = _text);
    			});
    		}
    	};

    	return [textContent, file];
    }

    class TextFileItem extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$6, safe_not_equal, { file: 1 });
    	}
    }

    /* src\frontend\views\FileItemView.svelte generated by Svelte v3.58.0 */

    function create_if_block_1(ctx) {
    	let textfileitem;
    	let updating_file;
    	let current;

    	function textfileitem_file_binding(value) {
    		/*textfileitem_file_binding*/ ctx[18](value);
    	}

    	let textfileitem_props = {};

    	if (/*file*/ ctx[0] !== void 0) {
    		textfileitem_props.file = /*file*/ ctx[0];
    	}

    	textfileitem = new TextFileItem({ props: textfileitem_props });
    	binding_callbacks.push(() => bind(textfileitem, 'file', textfileitem_file_binding));

    	return {
    		c() {
    			create_component(textfileitem.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(textfileitem.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(textfileitem, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const textfileitem_changes = {};

    			if (!updating_file && dirty & /*file*/ 1) {
    				updating_file = true;
    				textfileitem_changes.file = /*file*/ ctx[0];
    				add_flush_callback(() => updating_file = false);
    			}

    			textfileitem.$set(textfileitem_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(textfileitem.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(textfileitem.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(textfileitem, detaching);
    		}
    	};
    }

    // (31:4) {#if isImage}
    function create_if_block$1(ctx) {
    	let img;
    	let img_src_value;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			img = element("img");
    			this.h();
    		},
    		l(nodes) {
    			img = claim_element(nodes, "IMG", { alt: true, src: true, class: true });
    			this.h();
    		},
    		h() {
    			attr(img, "alt", "none");
    			if (!src_url_equal(img.src, img_src_value = `${/*file*/ ctx[0].path}`)) attr(img, "src", img_src_value);
    			attr(img, "class", "svelte-973dts");
    			if (/*imageWidth*/ ctx[7] === void 0 || /*imageHeight*/ ctx[8] === void 0) add_render_callback(() => /*img_load_handler*/ ctx[17].call(img));
    		},
    		m(target, anchor) {
    			insert_hydration(target, img, anchor);

    			if (!mounted) {
    				dispose = listen(img, "load", /*img_load_handler*/ ctx[17]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*file*/ 1 && !src_url_equal(img.src, img_src_value = `${/*file*/ ctx[0].path}`)) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(img);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let div_1;
    	let filestats;
    	let updating_file;
    	let updating_isImage;
    	let updating_isText;
    	let updating_extension;
    	let updating_association;
    	let updating_type;
    	let updating_imageWidth;
    	let updating_imageHeight;
    	let t0;
    	let current_block_type_index;
    	let if_block;
    	let t1;
    	let rightresizearea;
    	let updating_parent;
    	let current;

    	function filestats_file_binding(value) {
    		/*filestats_file_binding*/ ctx[9](value);
    	}

    	function filestats_isImage_binding(value) {
    		/*filestats_isImage_binding*/ ctx[10](value);
    	}

    	function filestats_isText_binding(value) {
    		/*filestats_isText_binding*/ ctx[11](value);
    	}

    	function filestats_extension_binding(value) {
    		/*filestats_extension_binding*/ ctx[12](value);
    	}

    	function filestats_association_binding(value) {
    		/*filestats_association_binding*/ ctx[13](value);
    	}

    	function filestats_type_binding(value) {
    		/*filestats_type_binding*/ ctx[14](value);
    	}

    	function filestats_imageWidth_binding(value) {
    		/*filestats_imageWidth_binding*/ ctx[15](value);
    	}

    	function filestats_imageHeight_binding(value) {
    		/*filestats_imageHeight_binding*/ ctx[16](value);
    	}

    	let filestats_props = {};

    	if (/*file*/ ctx[0] !== void 0) {
    		filestats_props.file = /*file*/ ctx[0];
    	}

    	if (/*isImage*/ ctx[5] !== void 0) {
    		filestats_props.isImage = /*isImage*/ ctx[5];
    	}

    	if (/*isText*/ ctx[6] !== void 0) {
    		filestats_props.isText = /*isText*/ ctx[6];
    	}

    	if (/*extension*/ ctx[1] !== void 0) {
    		filestats_props.extension = /*extension*/ ctx[1];
    	}

    	if (/*association*/ ctx[2] !== void 0) {
    		filestats_props.association = /*association*/ ctx[2];
    	}

    	if (/*type*/ ctx[3] !== void 0) {
    		filestats_props.type = /*type*/ ctx[3];
    	}

    	if (/*imageWidth*/ ctx[7] !== void 0) {
    		filestats_props.imageWidth = /*imageWidth*/ ctx[7];
    	}

    	if (/*imageHeight*/ ctx[8] !== void 0) {
    		filestats_props.imageHeight = /*imageHeight*/ ctx[8];
    	}

    	filestats = new Filestats({ props: filestats_props });
    	binding_callbacks.push(() => bind(filestats, 'file', filestats_file_binding));
    	binding_callbacks.push(() => bind(filestats, 'isImage', filestats_isImage_binding));
    	binding_callbacks.push(() => bind(filestats, 'isText', filestats_isText_binding));
    	binding_callbacks.push(() => bind(filestats, 'extension', filestats_extension_binding));
    	binding_callbacks.push(() => bind(filestats, 'association', filestats_association_binding));
    	binding_callbacks.push(() => bind(filestats, 'type', filestats_type_binding));
    	binding_callbacks.push(() => bind(filestats, 'imageWidth', filestats_imageWidth_binding));
    	binding_callbacks.push(() => bind(filestats, 'imageHeight', filestats_imageHeight_binding));
    	const if_block_creators = [create_if_block$1, create_if_block_1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*isImage*/ ctx[5]) return 0;
    		if (/*isText*/ ctx[6]) return 1;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	function rightresizearea_parent_binding(value) {
    		/*rightresizearea_parent_binding*/ ctx[19](value);
    	}

    	let rightresizearea_props = { minWidth: 400 };

    	if (/*div*/ ctx[4] !== void 0) {
    		rightresizearea_props.parent = /*div*/ ctx[4];
    	}

    	rightresizearea = new RightResizeArea({ props: rightresizearea_props });
    	binding_callbacks.push(() => bind(rightresizearea, 'parent', rightresizearea_parent_binding));

    	return {
    		c() {
    			div_1 = element("div");
    			create_component(filestats.$$.fragment);
    			t0 = space();
    			if (if_block) if_block.c();
    			t1 = space();
    			create_component(rightresizearea.$$.fragment);
    			this.h();
    		},
    		l(nodes) {
    			div_1 = claim_element(nodes, "DIV", { class: true });
    			var div_1_nodes = children(div_1);
    			claim_component(filestats.$$.fragment, div_1_nodes);
    			t0 = claim_space(div_1_nodes);
    			if (if_block) if_block.l(div_1_nodes);
    			t1 = claim_space(div_1_nodes);
    			claim_component(rightresizearea.$$.fragment, div_1_nodes);
    			div_1_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div_1, "class", "main-content svelte-973dts");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div_1, anchor);
    			mount_component(filestats, div_1, null);
    			append_hydration(div_1, t0);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(div_1, null);
    			}

    			append_hydration(div_1, t1);
    			mount_component(rightresizearea, div_1, null);
    			/*div_1_binding*/ ctx[20](div_1);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const filestats_changes = {};

    			if (!updating_file && dirty & /*file*/ 1) {
    				updating_file = true;
    				filestats_changes.file = /*file*/ ctx[0];
    				add_flush_callback(() => updating_file = false);
    			}

    			if (!updating_isImage && dirty & /*isImage*/ 32) {
    				updating_isImage = true;
    				filestats_changes.isImage = /*isImage*/ ctx[5];
    				add_flush_callback(() => updating_isImage = false);
    			}

    			if (!updating_isText && dirty & /*isText*/ 64) {
    				updating_isText = true;
    				filestats_changes.isText = /*isText*/ ctx[6];
    				add_flush_callback(() => updating_isText = false);
    			}

    			if (!updating_extension && dirty & /*extension*/ 2) {
    				updating_extension = true;
    				filestats_changes.extension = /*extension*/ ctx[1];
    				add_flush_callback(() => updating_extension = false);
    			}

    			if (!updating_association && dirty & /*association*/ 4) {
    				updating_association = true;
    				filestats_changes.association = /*association*/ ctx[2];
    				add_flush_callback(() => updating_association = false);
    			}

    			if (!updating_type && dirty & /*type*/ 8) {
    				updating_type = true;
    				filestats_changes.type = /*type*/ ctx[3];
    				add_flush_callback(() => updating_type = false);
    			}

    			if (!updating_imageWidth && dirty & /*imageWidth*/ 128) {
    				updating_imageWidth = true;
    				filestats_changes.imageWidth = /*imageWidth*/ ctx[7];
    				add_flush_callback(() => updating_imageWidth = false);
    			}

    			if (!updating_imageHeight && dirty & /*imageHeight*/ 256) {
    				updating_imageHeight = true;
    				filestats_changes.imageHeight = /*imageHeight*/ ctx[8];
    				add_flush_callback(() => updating_imageHeight = false);
    			}

    			filestats.$set(filestats_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					} else {
    						if_block.p(ctx, dirty);
    					}

    					transition_in(if_block, 1);
    					if_block.m(div_1, t1);
    				} else {
    					if_block = null;
    				}
    			}

    			const rightresizearea_changes = {};

    			if (!updating_parent && dirty & /*div*/ 16) {
    				updating_parent = true;
    				rightresizearea_changes.parent = /*div*/ ctx[4];
    				add_flush_callback(() => updating_parent = false);
    			}

    			rightresizearea.$set(rightresizearea_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(filestats.$$.fragment, local);
    			transition_in(if_block);
    			transition_in(rightresizearea.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(filestats.$$.fragment, local);
    			transition_out(if_block);
    			transition_out(rightresizearea.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div_1);
    			destroy_component(filestats);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}

    			destroy_component(rightresizearea);
    			/*div_1_binding*/ ctx[20](null);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { file } = $$props;
    	let div;
    	let extension = "";
    	let isImage = false;
    	let isText = false;
    	let association = "";
    	let type = "";
    	let imageWidth, imageHeight;

    	function filestats_file_binding(value) {
    		file = value;
    		$$invalidate(0, file);
    	}

    	function filestats_isImage_binding(value) {
    		isImage = value;
    		(((($$invalidate(5, isImage), $$invalidate(0, file)), $$invalidate(1, extension)), $$invalidate(2, association)), $$invalidate(3, type));
    	}

    	function filestats_isText_binding(value) {
    		isText = value;
    		(((($$invalidate(6, isText), $$invalidate(0, file)), $$invalidate(1, extension)), $$invalidate(2, association)), $$invalidate(3, type));
    	}

    	function filestats_extension_binding(value) {
    		extension = value;
    		((($$invalidate(1, extension), $$invalidate(0, file)), $$invalidate(2, association)), $$invalidate(3, type));
    	}

    	function filestats_association_binding(value) {
    		association = value;
    		((($$invalidate(2, association), $$invalidate(0, file)), $$invalidate(1, extension)), $$invalidate(3, type));
    	}

    	function filestats_type_binding(value) {
    		type = value;
    		((($$invalidate(3, type), $$invalidate(0, file)), $$invalidate(1, extension)), $$invalidate(2, association));
    	}

    	function filestats_imageWidth_binding(value) {
    		imageWidth = value;
    		$$invalidate(7, imageWidth);
    	}

    	function filestats_imageHeight_binding(value) {
    		imageHeight = value;
    		$$invalidate(8, imageHeight);
    	}

    	function img_load_handler() {
    		imageWidth = this.naturalWidth;
    		imageHeight = this.naturalHeight;
    		$$invalidate(7, imageWidth);
    		$$invalidate(8, imageHeight);
    	}

    	function textfileitem_file_binding(value) {
    		file = value;
    		$$invalidate(0, file);
    	}

    	function rightresizearea_parent_binding(value) {
    		div = value;
    		$$invalidate(4, div);
    	}

    	function div_1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			div = $$value;
    			$$invalidate(4, div);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('file' in $$props) $$invalidate(0, file = $$props.file);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*file, extension, association, type*/ 15) {
    			{
    				$$invalidate(1, extension = file.name.substring(file.name.lastIndexOf(".") + 1));
    				$$invalidate(2, association = getAssociation(extension));
    				$$invalidate(5, isImage = association == "file.image");
    				$$invalidate(3, type = getType(extension));
    				$$invalidate(6, isText = type == "file.plaintext");
    			}
    		}
    	};

    	return [
    		file,
    		extension,
    		association,
    		type,
    		div,
    		isImage,
    		isText,
    		imageWidth,
    		imageHeight,
    		filestats_file_binding,
    		filestats_isImage_binding,
    		filestats_isText_binding,
    		filestats_extension_binding,
    		filestats_association_binding,
    		filestats_type_binding,
    		filestats_imageWidth_binding,
    		filestats_imageHeight_binding,
    		img_load_handler,
    		textfileitem_file_binding,
    		rightresizearea_parent_binding,
    		div_1_binding
    	];
    }

    class FileItemView extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$5, safe_not_equal, { file: 0 });
    	}
    }

    let icons = {};

    async function getIcon(name) {
        if(name in icons) return icons[name];
        icons[name] = await window.api.getIcon(name);
        return icons[name];
    }

    let _shiftDown = false;
    let _ctrlDown = false;

    const Keyboard = {
        /**
         * 
         * @param {KeyboardEvent} e 
         */
        handleDown(e) {
            if(e.key == "Shift") {
                _shiftDown = true;
            }else if(e.key == "Control") {
                _ctrlDown = true;
            }
        },
        handleUp(e) {
            if(e.key == "Shift") {
                _shiftDown = false;
            }else if(e.key == "Control") {
                _ctrlDown = false;
            }
        },
        isShiftDown() { return _shiftDown; },
        isCtrlDown() { return _ctrlDown; },
    };

    /* src\frontend\views\FolderColumnViewEntry.svelte generated by Svelte v3.58.0 */

    function create_fragment$4(ctx) {
    	let li;
    	let button_1;
    	let span0;
    	let t0;
    	let span2;
    	let span1;
    	let t1_value = /*entry*/ ctx[0].name + "";
    	let t1;
    	let t2;
    	let input_1;
    	let button_1_class_value;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			li = element("li");
    			button_1 = element("button");
    			span0 = element("span");
    			t0 = space();
    			span2 = element("span");
    			span1 = element("span");
    			t1 = text(t1_value);
    			t2 = space();
    			input_1 = element("input");
    			this.h();
    		},
    		l(nodes) {
    			li = claim_element(nodes, "LI", { draggable: true, class: true });
    			var li_nodes = children(li);
    			button_1 = claim_element(li_nodes, "BUTTON", { class: true });
    			var button_1_nodes = children(button_1);
    			span0 = claim_element(button_1_nodes, "SPAN", {});
    			var span0_nodes = children(span0);
    			span0_nodes.forEach(detach);
    			t0 = claim_space(button_1_nodes);
    			span2 = claim_element(button_1_nodes, "SPAN", {});
    			var span2_nodes = children(span2);
    			span1 = claim_element(span2_nodes, "SPAN", {});
    			var span1_nodes = children(span1);
    			t1 = claim_text(span1_nodes, t1_value);
    			span1_nodes.forEach(detach);
    			t2 = claim_space(span2_nodes);
    			input_1 = claim_element(span2_nodes, "INPUT", { class: true });
    			span2_nodes.forEach(detach);
    			button_1_nodes.forEach(detach);
    			li_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			set_style(span1, "display", !/*renaming*/ ctx[5] ? "inline" : "none");
    			attr(input_1, "class", "svelte-1gtex7m");
    			set_style(input_1, "display", /*renaming*/ ctx[5] ? "inline" : "none");
    			attr(button_1, "class", button_1_class_value = "" + (null_to_empty(`${/*highlight*/ ctx[1] ? "active " : ""}${/*selected*/ ctx[6] ? "selected " : ""}`) + " svelte-1gtex7m"));
    			attr(li, "draggable", "true");
    			attr(li, "class", "svelte-1gtex7m");
    		},
    		m(target, anchor) {
    			insert_hydration(target, li, anchor);
    			append_hydration(li, button_1);
    			append_hydration(button_1, span0);
    			span0.innerHTML = /*icon*/ ctx[2];
    			append_hydration(button_1, t0);
    			append_hydration(button_1, span2);
    			append_hydration(span2, span1);
    			append_hydration(span1, t1);
    			append_hydration(span2, t2);
    			append_hydration(span2, input_1);
    			/*input_1_binding*/ ctx[15](input_1);
    			/*button_1_binding*/ ctx[18](button_1);

    			if (!mounted) {
    				dispose = [
    					listen(input_1, "focusout", /*focusout_handler*/ ctx[16]),
    					listen(input_1, "keydown", /*keydown_handler*/ ctx[17]),
    					listen(button_1, "mousedown", /*mousedown_handler*/ ctx[19]),
    					listen(button_1, "mouseup", /*clickHandler*/ ctx[9]),
    					listen(button_1, "keydown", /*keydown_handler_1*/ ctx[20]),
    					listen(li, "dragstart", /*dragstart_handler*/ ctx[21]),
    					listen(li, "drop", /*drop_handler*/ ctx[22])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*icon*/ 4) span0.innerHTML = /*icon*/ ctx[2];			if (dirty & /*entry*/ 1 && t1_value !== (t1_value = /*entry*/ ctx[0].name + "")) set_data(t1, t1_value);

    			if (dirty & /*renaming*/ 32) {
    				set_style(span1, "display", !/*renaming*/ ctx[5] ? "inline" : "none");
    			}

    			if (dirty & /*renaming*/ 32) {
    				set_style(input_1, "display", /*renaming*/ ctx[5] ? "inline" : "none");
    			}

    			if (dirty & /*highlight, selected*/ 66 && button_1_class_value !== (button_1_class_value = "" + (null_to_empty(`${/*highlight*/ ctx[1] ? "active " : ""}${/*selected*/ ctx[6] ? "selected " : ""}`) + " svelte-1gtex7m"))) {
    				attr(button_1, "class", button_1_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(li);
    			/*input_1_binding*/ ctx[15](null);
    			/*button_1_binding*/ ctx[18](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $EntrySelection;
    	component_subscribe($$self, EntrySelection, $$value => $$invalidate(14, $EntrySelection = $$value));

    	let { entry = {
    		isBlockDevice: false,
    		isCharacterDevice: false,
    		isDirectory: false,
    		isFIFO: false,
    		isFile: true,
    		isSocket: false,
    		isSymbolicLink: false,
    		name: entry.name
    	} } = $$props;

    	let { highlight = false } = $$props;

    	let { open = () => {
    		
    	} } = $$props;

    	let { selectFrom } = $$props;
    	let { handleRangeSelect } = $$props;
    	let { index } = $$props;
    	let icon = "";

    	/** @type {HTMLInputElement} */
    	let input;

    	let button;

    	function beginRename() {
    		$$invalidate(5, renaming = true);
    		$$invalidate(3, input.value = entry.name, input);

    		tick().then(() => {
    			input.focus();
    		});
    	}

    	/**
     * 
     * @param {MouseEvent} e
     */
    	function clickHandler(e) {
    		if (!mousedown) return;
    		$$invalidate(7, mousedown = false);
    		console.log(e);

    		if (e.button == 2) {
    			Dropdown.showDropdown(e.x, e.y, [
    				{
    					name: "Rename",
    					execute() {
    						beginRename();
    						Dropdown.hideDropdown();
    					}
    				},
    				{
    					name: "Move to recycle",
    					execute() {
    						Dropdown.hideDropdown();
    						Directory.trash(entry.path);
    					}
    				}
    			]);
    		} else {
    			if (Keyboard.isShiftDown()) {
    				handleRangeSelect();
    			} else if (Keyboard.isCtrlDown()) {
    				EntrySelection.toggle(entry.path);
    				$$invalidate(10, selectFrom = index);
    			} else {
    				open();
    				EntrySelection.singleSelect(entry.path);
    				$$invalidate(10, selectFrom = index);
    			}
    		}

    		e.stopPropagation();
    	}
    	let renaming = false;
    	let selected = false;
    	let mousedown = false;

    	function input_1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			input = $$value;
    			$$invalidate(3, input);
    		});
    	}

    	const focusout_handler = e => {
    		$$invalidate(5, renaming = false);
    	};

    	const keydown_handler = e => {
    		if (e.key == "Escape") {
    			button.focus();
    		}

    		if (e.key == "Enter") {
    			const value = e.target.value;
    			const parent = Path.parent(entry.path);
    			Directory.rename(entry.path, Path.join(parent, value));
    			button.focus();
    		}
    	};

    	function button_1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			button = $$value;
    			$$invalidate(4, button);
    		});
    	}

    	const mousedown_handler = () => {
    		$$invalidate(7, mousedown = true);
    	};

    	const keydown_handler_1 = e => {
    		// console.log("keypress", e);
    		if (e.key === "F2") {
    			beginRename();
    		}
    	};

    	const dragstart_handler = e => {
    		e.dataTransfer.setData("application/json", JSON.stringify(entry));
    	};

    	const drop_handler = e => {
    		console.log(e);
    	};

    	$$self.$$set = $$props => {
    		if ('entry' in $$props) $$invalidate(0, entry = $$props.entry);
    		if ('highlight' in $$props) $$invalidate(1, highlight = $$props.highlight);
    		if ('open' in $$props) $$invalidate(11, open = $$props.open);
    		if ('selectFrom' in $$props) $$invalidate(10, selectFrom = $$props.selectFrom);
    		if ('handleRangeSelect' in $$props) $$invalidate(12, handleRangeSelect = $$props.handleRangeSelect);
    		if ('index' in $$props) $$invalidate(13, index = $$props.index);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*entry, highlight*/ 3) {
    			{
    				let iconName = "file.default";

    				// console.log(entry, opened);
    				if (entry.isDirectory) {
    					if (highlight) {
    						iconName = "folder.default.open";
    					} else {
    						iconName = "folder.default";
    					}
    				} else if (entry.isFile) {
    					const extension = entry.name.slice(entry.name.lastIndexOf(".") + 1);
    					const association = getAssociation(extension);

    					// console.log(extension, association);
    					if (association) iconName = association;
    				}

    				getIcon(iconName).then(_icon => {
    					$$invalidate(2, icon = _icon);
    				});
    			}
    		}

    		if ($$self.$$.dirty & /*entry*/ 1) {
    			entry.name;
    		}

    		if ($$self.$$.dirty & /*$EntrySelection, entry*/ 16385) {
    			$$invalidate(6, selected = $EntrySelection.has(entry.path));
    		}
    	};

    	return [
    		entry,
    		highlight,
    		icon,
    		input,
    		button,
    		renaming,
    		selected,
    		mousedown,
    		beginRename,
    		clickHandler,
    		selectFrom,
    		open,
    		handleRangeSelect,
    		index,
    		$EntrySelection,
    		input_1_binding,
    		focusout_handler,
    		keydown_handler,
    		button_1_binding,
    		mousedown_handler,
    		keydown_handler_1,
    		dragstart_handler,
    		drop_handler
    	];
    }

    class FolderColumnViewEntry extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$3, create_fragment$4, safe_not_equal, {
    			entry: 0,
    			highlight: 1,
    			open: 11,
    			selectFrom: 10,
    			handleRangeSelect: 12,
    			index: 13
    		});
    	}
    }

    /* src\frontend\views\FolderColumnView.svelte generated by Svelte v3.58.0 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[23] = list[i];
    	child_ctx[25] = i;
    	return child_ctx;
    }

    // (96:8) {#each directory.entries as entry, i}
    function create_each_block$1(ctx) {
    	let foldercolumnviewentry;
    	let updating_selectFrom;
    	let current;

    	function func() {
    		return /*func*/ ctx[12](/*i*/ ctx[25], /*entry*/ ctx[23]);
    	}

    	function func_1() {
    		return /*func_1*/ ctx[13](/*i*/ ctx[25], /*entry*/ ctx[23]);
    	}

    	function foldercolumnviewentry_selectFrom_binding(value) {
    		/*foldercolumnviewentry_selectFrom_binding*/ ctx[14](value);
    	}

    	let foldercolumnviewentry_props = {
    		open: func,
    		entry: /*entry*/ ctx[23],
    		highlight: /*highlighted*/ ctx[3] == /*i*/ ctx[25],
    		index: /*i*/ ctx[25],
    		handleRangeSelect: func_1
    	};

    	if (/*selectFrom*/ ctx[9] !== void 0) {
    		foldercolumnviewentry_props.selectFrom = /*selectFrom*/ ctx[9];
    	}

    	foldercolumnviewentry = new FolderColumnViewEntry({ props: foldercolumnviewentry_props });
    	binding_callbacks.push(() => bind(foldercolumnviewentry, 'selectFrom', foldercolumnviewentry_selectFrom_binding));

    	return {
    		c() {
    			create_component(foldercolumnviewentry.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(foldercolumnviewentry.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(foldercolumnviewentry, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const foldercolumnviewentry_changes = {};
    			if (dirty & /*highlighted, directory, index*/ 11) foldercolumnviewentry_changes.open = func;
    			if (dirty & /*directory*/ 1) foldercolumnviewentry_changes.entry = /*entry*/ ctx[23];
    			if (dirty & /*highlighted*/ 8) foldercolumnviewentry_changes.highlight = /*highlighted*/ ctx[3] == /*i*/ ctx[25];
    			if (dirty & /*selectFrom, directory*/ 513) foldercolumnviewentry_changes.handleRangeSelect = func_1;

    			if (!updating_selectFrom && dirty & /*selectFrom*/ 512) {
    				updating_selectFrom = true;
    				foldercolumnviewentry_changes.selectFrom = /*selectFrom*/ ctx[9];
    				add_flush_callback(() => updating_selectFrom = false);
    			}

    			foldercolumnviewentry.$set(foldercolumnviewentry_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(foldercolumnviewentry.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(foldercolumnviewentry.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(foldercolumnviewentry, detaching);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let div_1;
    	let ul;
    	let t0;
    	let li;
    	let span;
    	let t1;
    	let input;
    	let t2;
    	let rightresizearea;
    	let updating_parent;
    	let updating_width;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*directory*/ ctx[0].entries;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	function rightresizearea_parent_binding(value) {
    		/*rightresizearea_parent_binding*/ ctx[19](value);
    	}

    	function rightresizearea_width_binding(value) {
    		/*rightresizearea_width_binding*/ ctx[20](value);
    	}

    	let rightresizearea_props = { minWidth: 200 };

    	if (/*div*/ ctx[4] !== void 0) {
    		rightresizearea_props.parent = /*div*/ ctx[4];
    	}

    	if (/*width*/ ctx[2] !== void 0) {
    		rightresizearea_props.width = /*width*/ ctx[2];
    	}

    	rightresizearea = new RightResizeArea({ props: rightresizearea_props });
    	binding_callbacks.push(() => bind(rightresizearea, 'parent', rightresizearea_parent_binding));
    	binding_callbacks.push(() => bind(rightresizearea, 'width', rightresizearea_width_binding));

    	return {
    		c() {
    			div_1 = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			li = element("li");
    			span = element("span");
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			create_component(rightresizearea.$$.fragment);
    			this.h();
    		},
    		l(nodes) {
    			div_1 = claim_element(nodes, "DIV", { class: true });
    			var div_1_nodes = children(div_1);
    			ul = claim_element(div_1_nodes, "UL", { class: true });
    			var ul_nodes = children(ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(ul_nodes);
    			}

    			t0 = claim_space(ul_nodes);
    			li = claim_element(ul_nodes, "LI", { class: true });
    			var li_nodes = children(li);
    			span = claim_element(li_nodes, "SPAN", { class: true });
    			var span_nodes = children(span);
    			span_nodes.forEach(detach);
    			t1 = claim_space(li_nodes);
    			input = claim_element(li_nodes, "INPUT", { class: true });
    			li_nodes.forEach(detach);
    			ul_nodes.forEach(detach);
    			t2 = claim_space(div_1_nodes);
    			claim_component(rightresizearea.$$.fragment, div_1_nodes);
    			div_1_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(span, "class", "svelte-bv3e8z");
    			attr(input, "class", "svelte-bv3e8z");
    			attr(li, "class", "svelte-bv3e8z");
    			set_style(li, "display", /*creating*/ ctx[6] ? "grid" : "none");
    			attr(ul, "class", "svelte-bv3e8z");
    			attr(div_1, "class", "main svelte-bv3e8z");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div_1, anchor);
    			append_hydration(div_1, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ul, null);
    				}
    			}

    			append_hydration(ul, t0);
    			append_hydration(ul, li);
    			append_hydration(li, span);
    			span.innerHTML = /*folderIcon*/ ctx[5];
    			append_hydration(li, t1);
    			append_hydration(li, input);
    			/*input_binding*/ ctx[15](input);
    			append_hydration(div_1, t2);
    			mount_component(rightresizearea, div_1, null);
    			/*div_1_binding*/ ctx[21](div_1);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(input, "focusout", /*cancelFolderCreate*/ ctx[11]),
    					listen(input, "keydown", /*keydown_handler*/ ctx[16]),
    					listen(ul, "mousedown", /*mousedown_handler*/ ctx[17]),
    					listen(ul, "mouseup", /*mouseup_handler*/ ctx[18]),
    					listen(div_1, "dragover", dragover_handler),
    					listen(div_1, "drop", /*drop_handler*/ ctx[22])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*highlighted, Directory, directory, index, selectFrom, EntrySelection, Math*/ 523) {
    				each_value = /*directory*/ ctx[0].entries;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, t0);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if (!current || dirty & /*folderIcon*/ 32) span.innerHTML = /*folderIcon*/ ctx[5];
    			if (dirty & /*creating*/ 64) {
    				set_style(li, "display", /*creating*/ ctx[6] ? "grid" : "none");
    			}

    			const rightresizearea_changes = {};

    			if (!updating_parent && dirty & /*div*/ 16) {
    				updating_parent = true;
    				rightresizearea_changes.parent = /*div*/ ctx[4];
    				add_flush_callback(() => updating_parent = false);
    			}

    			if (!updating_width && dirty & /*width*/ 4) {
    				updating_width = true;
    				rightresizearea_changes.width = /*width*/ ctx[2];
    				add_flush_callback(() => updating_width = false);
    			}

    			rightresizearea.$set(rightresizearea_changes);
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(rightresizearea.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(rightresizearea.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div_1);
    			destroy_each(each_blocks, detaching);
    			/*input_binding*/ ctx[15](null);
    			destroy_component(rightresizearea);
    			/*div_1_binding*/ ctx[21](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    const dragover_handler = e => {
    	// console.log(e)
    	e.preventDefault();

    	e.dataTransfer.dropEffect = "move";
    };

    function instance$2($$self, $$props, $$invalidate) {
    	let { directory } = $$props;
    	let { index = 0 } = $$props;
    	let width = 200;
    	let highlighted = -1;
    	let div;
    	let folderIcon = "";

    	getIcon("folder.default").then(a => {
    		$$invalidate(5, folderIcon = a);
    	});

    	let creating = false;

    	/** @type {HTMLInputElement} */
    	let folderCreateInput;

    	function finishFolderCreate() {
    		Directory.mkdir(Path.join(directory.path, folderCreateInput.value));
    		$$invalidate(6, creating = false);
    		$$invalidate(7, folderCreateInput.value = "", folderCreateInput);
    		folderCreateInput.blur();
    	}

    	function cancelFolderCreate() {
    		$$invalidate(6, creating = false);
    		$$invalidate(7, folderCreateInput.value = "", folderCreateInput);
    		folderCreateInput.blur();
    	}

    	let mousedown = false;
    	let selectFrom = -1;

    	const func = (i, entry) => {
    		if (highlighted === i) return;
    		$$invalidate(3, highlighted = i);
    		Directory.open(entry.name, index + 1);
    	};

    	const func_1 = (i, entry) => {
    		if (selectFrom == -1) {
    			$$invalidate(9, selectFrom = i);
    			EntrySelection.select(entry.path);
    		} else {
    			let max = Math.max(selectFrom, i);

    			for (let j = Math.min(selectFrom, i); j <= max; j++) {
    				EntrySelection.select(directory.entries[j].path);
    			}
    		}
    	};

    	function foldercolumnviewentry_selectFrom_binding(value) {
    		selectFrom = value;
    		$$invalidate(9, selectFrom);
    	}

    	function input_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			folderCreateInput = $$value;
    			$$invalidate(7, folderCreateInput);
    		});
    	}

    	const keydown_handler = e => {
    		if (e.key == "Escape") {
    			cancelFolderCreate();
    		}

    		if (e.key == "Enter") {
    			finishFolderCreate();
    		}
    	};

    	const mousedown_handler = () => {
    		$$invalidate(8, mousedown = true);
    	};

    	const mouseup_handler = e => {
    		if (!mousedown) return;
    		$$invalidate(8, mousedown = false);
    		EntrySelection.clear();

    		if (e.button == 2) {
    			// openOptions(e.x, e.y, null);
    			Dropdown.showDropdown(e.x, e.y, [
    				{
    					name: "New Folder",
    					execute() {
    						console.log("make a new folder");
    						$$invalidate(6, creating = true);
    						Dropdown.hideDropdown();

    						tick().then(() => {
    							$$invalidate(7, folderCreateInput.value = "New Folder", folderCreateInput);
    							folderCreateInput.focus();
    							folderCreateInput.select();
    						});
    					}
    				}
    			]);
    		} else {
    			$$invalidate(3, highlighted = -1);
    			Directory.close(index + 1);
    		}
    	};

    	function rightresizearea_parent_binding(value) {
    		div = value;
    		$$invalidate(4, div);
    	}

    	function rightresizearea_width_binding(value) {
    		width = value;
    		$$invalidate(2, width);
    	}

    	function div_1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			div = $$value;
    			$$invalidate(4, div);
    		});
    	}

    	const drop_handler = e => {
    		console.log(e);
    		let entry = JSON.parse(e.dataTransfer.getData("application/json"));
    		Directory.rename(entry.path, `${directory.path}/${entry.name}`);
    	};

    	$$self.$$set = $$props => {
    		if ('directory' in $$props) $$invalidate(0, directory = $$props.directory);
    		if ('index' in $$props) $$invalidate(1, index = $$props.index);
    	};

    	return [
    		directory,
    		index,
    		width,
    		highlighted,
    		div,
    		folderIcon,
    		creating,
    		folderCreateInput,
    		mousedown,
    		selectFrom,
    		finishFolderCreate,
    		cancelFolderCreate,
    		func,
    		func_1,
    		foldercolumnviewentry_selectFrom_binding,
    		input_binding,
    		keydown_handler,
    		mousedown_handler,
    		mouseup_handler,
    		rightresizearea_parent_binding,
    		rightresizearea_width_binding,
    		div_1_binding,
    		drop_handler
    	];
    }

    class FolderColumnView extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$3, safe_not_equal, { directory: 0, index: 1 });
    	}
    }

    /* src\frontend\views\DirectoryView.svelte generated by Svelte v3.58.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[1] = list[i];
    	child_ctx[3] = i;
    	return child_ctx;
    }

    // (16:12) {:else}
    function create_else_block(ctx) {
    	let fileitemview;
    	let current;
    	fileitemview = new FileItemView({ props: { file: /*entry*/ ctx[1] } });

    	return {
    		c() {
    			create_component(fileitemview.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(fileitemview.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(fileitemview, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const fileitemview_changes = {};
    			if (dirty & /*$Directory*/ 1) fileitemview_changes.file = /*entry*/ ctx[1];
    			fileitemview.$set(fileitemview_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(fileitemview.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(fileitemview.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(fileitemview, detaching);
    		}
    	};
    }

    // (14:12) {#if entry.isDirectory}
    function create_if_block(ctx) {
    	let foldercolumnview;
    	let current;

    	foldercolumnview = new FolderColumnView({
    			props: {
    				directory: /*entry*/ ctx[1],
    				index: /*i*/ ctx[3]
    			}
    		});

    	return {
    		c() {
    			create_component(foldercolumnview.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(foldercolumnview.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(foldercolumnview, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const foldercolumnview_changes = {};
    			if (dirty & /*$Directory*/ 1) foldercolumnview_changes.directory = /*entry*/ ctx[1];
    			foldercolumnview.$set(foldercolumnview_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(foldercolumnview.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(foldercolumnview.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(foldercolumnview, detaching);
    		}
    	};
    }

    // (13:8) {#each $Directory.openedEntries as entry, i}
    function create_each_block(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*entry*/ ctx[1].isDirectory) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l(nodes) {
    			if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_hydration(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let div1;
    	let div0;
    	let current;
    	let each_value = /*$Directory*/ ctx[0].openedEntries;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l(nodes) {
    			div1 = claim_element(nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			div0 = claim_element(div1_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div0_nodes);
    			}

    			div0_nodes.forEach(detach);
    			div1_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div0, "class", "svelte-bweg9q");
    			attr(div1, "class", "column-container svelte-bweg9q");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div1, anchor);
    			append_hydration(div1, div0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div0, null);
    				}
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*$Directory*/ 1) {
    				each_value = /*$Directory*/ ctx[0].openedEntries;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div0, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $Directory;
    	component_subscribe($$self, Directory, $$value => $$invalidate(0, $Directory = $$value));

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$Directory*/ 1) {
    			console.log($Directory);
    		}
    	};

    	return [$Directory];
    }

    class DirectoryView extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$2, safe_not_equal, {});
    	}
    }

    /* src\frontend\views\MenuBar.svelte generated by Svelte v3.58.0 */

    function create_fragment$1(ctx) {
    	let ul;
    	let li0;
    	let t0;
    	let t1;
    	let li1;
    	let t2;

    	return {
    		c() {
    			ul = element("ul");
    			li0 = element("li");
    			t0 = text("Title");
    			t1 = space();
    			li1 = element("li");
    			t2 = text("Title2");
    			this.h();
    		},
    		l(nodes) {
    			ul = claim_element(nodes, "UL", { class: true });
    			var ul_nodes = children(ul);
    			li0 = claim_element(ul_nodes, "LI", { class: true });
    			var li0_nodes = children(li0);
    			t0 = claim_text(li0_nodes, "Title");
    			li0_nodes.forEach(detach);
    			t1 = claim_space(ul_nodes);
    			li1 = claim_element(ul_nodes, "LI", {});
    			var li1_nodes = children(li1);
    			t2 = claim_text(li1_nodes, "Title2");
    			li1_nodes.forEach(detach);
    			ul_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(li0, "class", "a svelte-6w4a0s");
    			attr(ul, "class", "svelte-6w4a0s");
    		},
    		m(target, anchor) {
    			insert_hydration(target, ul, anchor);
    			append_hydration(ul, li0);
    			append_hydration(li0, t0);
    			append_hydration(ul, t1);
    			append_hydration(ul, li1);
    			append_hydration(li1, t2);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(ul);
    		}
    	};
    }

    class MenuBar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$1, safe_not_equal, {});
    	}
    }

    /* src\frontend\App.svelte generated by Svelte v3.58.0 */

    function create_fragment(ctx) {
    	let div1;
    	let menubar;
    	let t0;
    	let div0;
    	let input;
    	let t1;
    	let directoryview;
    	let t2;
    	let dropdownoptions;
    	let updating_x;
    	let updating_y;
    	let updating_show;
    	let current;
    	let mounted;
    	let dispose;
    	menubar = new MenuBar({});
    	directoryview = new DirectoryView({});

    	function dropdownoptions_x_binding(value) {
    		/*dropdownoptions_x_binding*/ ctx[2](value);
    	}

    	function dropdownoptions_y_binding(value) {
    		/*dropdownoptions_y_binding*/ ctx[3](value);
    	}

    	function dropdownoptions_show_binding(value) {
    		/*dropdownoptions_show_binding*/ ctx[4](value);
    	}

    	let dropdownoptions_props = { options: /*$Dropdown*/ ctx[0].options };

    	if (/*$Dropdown*/ ctx[0].x !== void 0) {
    		dropdownoptions_props.x = /*$Dropdown*/ ctx[0].x;
    	}

    	if (/*$Dropdown*/ ctx[0].y !== void 0) {
    		dropdownoptions_props.y = /*$Dropdown*/ ctx[0].y;
    	}

    	if (/*$Dropdown*/ ctx[0].show !== void 0) {
    		dropdownoptions_props.show = /*$Dropdown*/ ctx[0].show;
    	}

    	dropdownoptions = new DropdownOptions({ props: dropdownoptions_props });
    	binding_callbacks.push(() => bind(dropdownoptions, 'x', dropdownoptions_x_binding));
    	binding_callbacks.push(() => bind(dropdownoptions, 'y', dropdownoptions_y_binding));
    	binding_callbacks.push(() => bind(dropdownoptions, 'show', dropdownoptions_show_binding));

    	return {
    		c() {
    			div1 = element("div");
    			create_component(menubar.$$.fragment);
    			t0 = space();
    			div0 = element("div");
    			input = element("input");
    			t1 = space();
    			create_component(directoryview.$$.fragment);
    			t2 = space();
    			create_component(dropdownoptions.$$.fragment);
    			this.h();
    		},
    		l(nodes) {
    			div1 = claim_element(nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			claim_component(menubar.$$.fragment, div1_nodes);
    			t0 = claim_space(div1_nodes);
    			div0 = claim_element(div1_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			input = claim_element(div0_nodes, "INPUT", { class: true });
    			div0_nodes.forEach(detach);
    			t1 = claim_space(div1_nodes);
    			claim_component(directoryview.$$.fragment, div1_nodes);
    			t2 = claim_space(div1_nodes);
    			claim_component(dropdownoptions.$$.fragment, div1_nodes);
    			div1_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(input, "class", "svelte-1nz9q2o");
    			attr(div0, "class", "toolbar svelte-1nz9q2o");
    			attr(div1, "class", "content svelte-1nz9q2o");
    			set_style(div1, "--background-color", /*settings*/ ctx[1].backgroundColor);
    		},
    		m(target, anchor) {
    			insert_hydration(target, div1, anchor);
    			mount_component(menubar, div1, null);
    			append_hydration(div1, t0);
    			append_hydration(div1, div0);
    			append_hydration(div0, input);
    			append_hydration(div1, t1);
    			mount_component(directoryview, div1, null);
    			append_hydration(div1, t2);
    			mount_component(dropdownoptions, div1, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(window, "keydown", Keyboard.handleDown),
    					listen(window, "keyup", Keyboard.handleUp)
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			const dropdownoptions_changes = {};
    			if (dirty & /*$Dropdown*/ 1) dropdownoptions_changes.options = /*$Dropdown*/ ctx[0].options;

    			if (!updating_x && dirty & /*$Dropdown*/ 1) {
    				updating_x = true;
    				dropdownoptions_changes.x = /*$Dropdown*/ ctx[0].x;
    				add_flush_callback(() => updating_x = false);
    			}

    			if (!updating_y && dirty & /*$Dropdown*/ 1) {
    				updating_y = true;
    				dropdownoptions_changes.y = /*$Dropdown*/ ctx[0].y;
    				add_flush_callback(() => updating_y = false);
    			}

    			if (!updating_show && dirty & /*$Dropdown*/ 1) {
    				updating_show = true;
    				dropdownoptions_changes.show = /*$Dropdown*/ ctx[0].show;
    				add_flush_callback(() => updating_show = false);
    			}

    			dropdownoptions.$set(dropdownoptions_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(menubar.$$.fragment, local);
    			transition_in(directoryview.$$.fragment, local);
    			transition_in(dropdownoptions.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(menubar.$$.fragment, local);
    			transition_out(directoryview.$$.fragment, local);
    			transition_out(dropdownoptions.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_component(menubar);
    			destroy_component(directoryview);
    			destroy_component(dropdownoptions);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    let baseName = "C:/Users/Andrew/stable-diffusion-webui";

    function instance($$self, $$props, $$invalidate) {
    	let $Dropdown;
    	component_subscribe($$self, Dropdown, $$value => $$invalidate(0, $Dropdown = $$value));
    	let settings = { backgroundColor: "#282b3f" };
    	Directory.setBase(baseName);
    	Dropdown.hideDropdown();

    	function dropdownoptions_x_binding(value) {
    		if ($$self.$$.not_equal($Dropdown.x, value)) {
    			$Dropdown.x = value;
    			Dropdown.set($Dropdown);
    		}
    	}

    	function dropdownoptions_y_binding(value) {
    		if ($$self.$$.not_equal($Dropdown.y, value)) {
    			$Dropdown.y = value;
    			Dropdown.set($Dropdown);
    		}
    	}

    	function dropdownoptions_show_binding(value) {
    		if ($$self.$$.not_equal($Dropdown.show, value)) {
    			$Dropdown.show = value;
    			Dropdown.set($Dropdown);
    		}
    	}

    	return [
    		$Dropdown,
    		settings,
    		dropdownoptions_x_binding,
    		dropdownoptions_y_binding,
    		dropdownoptions_show_binding
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    new App({
        target: document.body,
    });

})();
