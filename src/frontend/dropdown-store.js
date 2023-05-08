


import { writable } from "svelte/store"











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

export const Dropdown = createDropdownStore();