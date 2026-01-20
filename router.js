console.log('[ROUTER] loaded');

import { state } from './state.js';

const routes = {};

export function registerRoute(name, handler) {
    routes[name] = handler;
}

export async function go(routeName, params = {}) {
    console.log('[ROUTER] go ->', routeName, params);

    const root = document.getElementById('app');
    root.innerHTML = '';

    if (!routes[routeName]) {
        throw new Error(`Route "${routeName}" not found`);
    }

    await routes[routeName](root, params, state);
}
