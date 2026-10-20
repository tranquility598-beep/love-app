class SoundManager {
    constructor() {
        this.enabled = true;
        this.debug = false; // Toggle to true to see warnings for unknown events
        this.categories = {
            ui: true,
            notifications: true,
            calls: true,
            voice: true,
            presence: true,
            app: true
        };

        // Configuration and Registry
        // Набор Love Soft v3 (Codex, tools/sound-design/codex-sfx): OGG без
        // паддинга MP3-кодировщика — звук начинается ровно с атаки.
        this.registry = {
            // Notifications
            notification: { category: 'notifications', path: 'assets/sounds/notifications/notification.ogg', preload: true, cooldown: 500 },
            system: { category: 'notifications', path: 'assets/sounds/notifications/system.ogg', preload: true, cooldown: 500 },

            // Chat: своё сообщение ушло / пришло в открытый чат
            message_send: { category: 'notifications', path: 'assets/sounds/chat/message_send.ogg', preload: true, cooldown: 120 },
            message_receive: { category: 'notifications', path: 'assets/sounds/chat/message_receive.ogg', preload: true, cooldown: 300 },

            // Calls (lazy, loop)
            call_incoming: { category: 'calls', path: 'assets/sounds/calls/call_incoming.ogg', preload: false, loop: true },
            call_outgoing: { category: 'calls', path: 'assets/sounds/calls/call_outgoing.ogg', preload: false, loop: true },

            // Voice (lazy)
            voice_mute: { category: 'voice', path: 'assets/sounds/voice/voice_mute.ogg', preload: false },
            voice_unmute: { category: 'voice', path: 'assets/sounds/voice/voice_unmute.ogg', preload: false },
            voice_deafen: { category: 'voice', path: 'assets/sounds/voice/voice_deafen.ogg', preload: false },
            voice_undeafen: { category: 'voice', path: 'assets/sounds/voice/voice_undeafen.ogg', preload: false },

            // Presence (lazy)
            user_join: { category: 'presence', path: 'assets/sounds/presence/user_join.ogg', preload: false, cooldown: 200 },
            user_leave: { category: 'presence', path: 'assets/sounds/presence/user_leave.ogg', preload: false, cooldown: 200 }
        };

        this.audioInstances = {};
        this.lastPlayed = {};
        
        // Splash specific tracking
        this.hasPlayedSplash = sessionStorage.getItem('hasPlayedSplash') === 'true';

        this._initPreload();
    }

    _initPreload() {
        for (const [eventName, config] of Object.entries(this.registry)) {
            if (config.preload) {
                this._instantiateAudio(eventName, config);
            }
        }
    }

    _instantiateAudio(eventName, config) {
        if (!this.audioInstances[eventName]) {
            const audio = new Audio(config.path);
            if (config.loop) {
                audio.loop = true;
            }
            this.audioInstances[eventName] = audio;
        }
        return this.audioInstances[eventName];
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.stopAll();
        }
    }

    setVolume(volume) {
        const volVal = volume / 100;
        for (const audio of Object.values(this.audioInstances)) {
            audio.volume = volVal;
        }
    }

    setCategoryEnabled(category, enabled) {
        if (this.categories.hasOwnProperty(category)) {
            this.categories[category] = enabled;
            if (!enabled) {
                // Stop any playing sounds in this category
                for (const [eventName, config] of Object.entries(this.registry)) {
                    if (config.category === category) {
                        this.stop(eventName);
                    }
                }
            }
        }
    }

    play(eventName) {
        if (!this.enabled) return;

        const config = this.registry[eventName];
        if (!config) {
            if (this.debug) console.warn(`[SoundManager] Unknown sound event: ${eventName}`);
            return;
        }

        if (!this.categories[config.category]) return;



        // Cooldown logic
        const now = Date.now();
        if (config.cooldown) {
            const lastTime = this.lastPlayed[eventName] || 0;
            if (now - lastTime < config.cooldown) {
                return; // Prevent spam
            }
        }
        this.lastPlayed[eventName] = now;

        const audio = this._instantiateAudio(eventName, config);
        const volumeSetting = window.settingsManager ? window.settingsManager.get('output-volume') : 100;
        audio.volume = (Number(volumeSetting) ?? 100) / 100;
        
        // Overlap prevention: reset time to start before playing again
        if (!audio.paused && !config.loop) {
            audio.currentTime = 0;
        }



        // Раньше здесь voice_mute/voice_deafen начинались с 0.3 с, чтобы
        // перескочить тишину старых MP3. Новые звуки короче (0.14–0.25 с) —
        // такой сдвиг съел бы их целиком.
        audio.play().catch(e => console.warn('[SoundManager] Play failed:', e));
    }

    stop(eventName) {
        const audio = this.audioInstances[eventName];
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    stopAll() {
        for (const audio of Object.values(this.audioInstances)) {
            audio.pause();
            audio.currentTime = 0;
        }
    }
}

// Global initialization
window.SoundManager = new SoundManager();

// Звуки переписки подчиняются тому же переключателю, что и уведомления
// («Звук уведомлений» в настройках).
window.playMessageSound = function (eventName) {
    if (window.settingsManager && window.settingsManager.get('notif-sound') === false) return;
    window.SoundManager.play(eventName);
};

document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-sound]');
    if (el && window.SoundManager) {
        const soundName = el.getAttribute('data-sound');
        window.SoundManager.play(soundName);
    }
});
