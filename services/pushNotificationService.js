// services/pushNotificationService.js
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Expo issues tokens with either prefix, depending on the SDK that created them.
const isExpoPushToken = (token) =>
    typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(token);

const maskToken = (token) => (typeof token === 'string' ? `${token.slice(0, 22)}...` : String(token));

// Expo returns HTTP 200 even when a device cannot be reached, so the result of each
// ticket must be read. Returns { sent, failed } so callers can log the real outcome.
async function postToExpo(messages) {
    const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(messages),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
        console.error(`[Push] Expo rejected the request (HTTP ${response.status}):`, body?.errors || body);
        return { sent: 0, failed: messages.length };
    }

    const tickets = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
    let sent = 0;
    let failed = 0;
    tickets.forEach((ticket, index) => {
        if (ticket?.status === 'ok') {
            sent += 1;
            return;
        }
        failed += 1;
        console.error('[Push] Expo could not deliver notification:', {
            token: maskToken(messages[index]?.to),
            error: ticket?.details?.error || 'Unknown',
            message: ticket?.message,
        });
    });
    return { sent, failed };
}

async function sendPushToDriver(expoPushToken, title, body, data = {}) {
    if (!isExpoPushToken(expoPushToken)) {
        console.warn('[Push] Skipped notification, invalid Expo token:', maskToken(expoPushToken));
        return { sent: 0, failed: 1 };
    }
    try {
        return await postToExpo([{
            to: expoPushToken,
            title,
            body,
            data,
            sound: 'default',
            priority: 'high',
            channelId: data?.channelId || 'logistiq-default',
        }]);
    } catch (err) {
        console.error('[Push] Failed to send push notification:', err.message);
        return { sent: 0, failed: 1 };
    }
}

async function sendPushToMany(tokens, title, body, data = {}) {
    const valid = tokens.filter(isExpoPushToken);
    if (!valid.length) return { sent: 0, failed: 0 };
    try {
        return await postToExpo(valid.map(to => ({ to, title, body, data, sound: 'default', priority: 'high' })));
    } catch (err) {
        console.error('[Push] Failed to send push notifications:', err.message);
        return { sent: 0, failed: valid.length };
    }
}

export { sendPushToDriver, sendPushToMany, isExpoPushToken };
