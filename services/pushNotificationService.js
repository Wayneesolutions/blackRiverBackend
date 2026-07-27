// services/pushNotificationService.js
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPushToDriver(expoPushToken, title, body, data = {}) {
    if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) return;
    try {
        await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                to: expoPushToken,
                title,
                body,
                data,
                sound: 'default',
                priority: 'high',
                channelId: data?.channelId || 'logistiq-default',
            }),
        });
    } catch (err) {
        console.error('[Push] Failed to send push notification:', err.message);
    }
}

async function sendPushToMany(tokens, title, body, data = {}) {
    const valid = tokens.filter(t => t && t.startsWith('ExponentPushToken'));
    if (!valid.length) return;
    try {
        await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(valid.map(to => ({ to, title, body, data, sound: 'default', priority: 'high' }))),
        });
    } catch (err) {
        console.error('[Push] Failed to send push notifications:', err.message);
    }
}

export { sendPushToDriver, sendPushToMany };
