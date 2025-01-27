import { ihpBackendUrl, fetchAuthenticated, query, DataSyncController, initIHPBackend } from 'ihp-datasync';

var currentUserId = null;

export async function initAuth() {
    if (currentUserId) {
        return currentUserId;
    }

    try {
        const didHandleRedirect = await handleRedirectBack();
        const hasJWT = localStorage.getItem('ihp_jwt') !== null;

        if (hasJWT) {
            currentUserId = localStorage.getItem('ihp_user_id');

            DataSyncController.getInstance().addEventListener('close', () => {
                const connectionClosedRightAfterOpen = !DataSyncController.getInstance().receivedFirstResponse;
                if (connectionClosedRightAfterOpen) {
                    handlePotentialInvalidJWT();
                }
            });

            return currentUserId;
        }
    } catch (e) {
        // If we don't clear the JWT here, this will cause an infinite loop
        // if there's some JWT from another IHP project. If the user is logged in
        // in the backend, the backend will redirect back here, and we will redirect
        // back to the backend here.
        localStorage.removeItem('ihp_jwt');
        localStorage.removeItem('ihp_user_id');
    }

    return null;
}

async function handlePotentialInvalidJWT() {
    const response = await fetchAuthenticated('/api/user', {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        method: 'GET',
    });
    
    if (!response.ok) {
        // Our JWT seems invalid, so get rid of it
        localStorage.removeItem('ihp_jwt');
        localStorage.removeItem('ihp_user_id');

        await loginWithRedirect();
    }
}

export async function getCurrentUser() {
    if (currentUserId === null) {
        return Promise.resolve(null);
    }

    return query('users')
            .filterWhere('id', currentUserId)
            .fetchOne();
}

export function getCurrentUserId() {
    return currentUserId;
}

export function logout(options = { redirect: null }) {
    localStorage.removeItem('ihp_jwt');
    localStorage.removeItem('ihp_user_id');

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = ihpBackendUrl('/DeleteSession');

    const method = document.createElement('input');
    method.type = 'hidden';
    method.name = '_method'
    method.value = 'DELETE';

    form.appendChild(method);

    if (options.redirect !== null) {
        const method = document.createElement('input');
        method.type = 'hidden';
        method.name = 'redirectBack'
        method.value = options.redirect;

        form.appendChild(method);
    }

    document.body.appendChild(form);
    form.submit();
}

export async function ensureIsUser() {
    const userId = await initAuth();
    if (userId === null) {
        await loginWithRedirect();
    }
}

export async function loginWithRedirect() {
    const redirectBack = window.encodeURIComponent(String(window.location.href));
    window.location = ihpBackendUrl('/NewSession?redirectBack=' + redirectBack);
}

export async function handleRedirectBack() {
    const query = new URLSearchParams(window.location.search);
    if (query.has('userId') && query.has('accessToken')) {
        const userId = query.get('userId');
        const accessToken = query.get('accessToken');

        // Remove the userId and access token query parameters from the URL
        query.delete('userId');
        query.delete('accessToken');
        const newQuery = query.toString();

        window.history.pushState({}, document.title, window.location.pathname + (newQuery.length > 0 ? '?' + newQuery : ''));

        // Fetching the JWT should happen after the query parameters have been removed, as this could take a few seconds
        // in the worst case
        const jwt = await fetchJWT(userId, accessToken);
        localStorage.setItem('ihp_jwt', jwt);
        localStorage.setItem('ihp_user_id', userId);
        
        return true;
    }

    return false;
}

export async function fetchJWT(userId, accessToken) {
    const response = await fetch(ihpBackendUrl('/JWT?userId=' + encodeURIComponent(userId) + '&accessToken=' + encodeURIComponent(accessToken)));
    if (!response.ok) {
        throw new Error('Failed to exchange access token for a JWT');
    }

    return response.text();
}

export function initThinBackend(options) {
    initIHPBackend(options);
}

export * from 'ihp-datasync';