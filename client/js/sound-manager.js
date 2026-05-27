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
        this.registry = {
            // Notifications
            notification: { category: 'notifications', path: 'assets/sounds/notifications/notification.mp3', preload: true, cooldown: 500 },
            system: { category: 'notifications', path: 'assets/sounds/notifications/system.mp3', preload: true, cooldown: 500 },
            
            // Calls (lazy, loop)
            call_incoming: { category: 'calls', path: 'assets/sounds/calls/call_incoming.mp3', preload: false, loop: true },
            call_outgoing: { category: 'calls', path: 'assets/sounds/calls/call_outgoing.mp3', preload: false, loop: true },
            
            // Voice (lazy)
            voice_mute: { category: 'voice', path: 'assets/sounds/voice/voice_mute.mp3', preload: false },
            voice_unmute: { category: 'voice', path: 'assets/sounds/voice/voice_unmute.mp3', preload: false },
            voice_deafen: { category: 'voice', path: 'assets/sounds/voice/voice_deafen.mp3', preload: false },
            voice_undeafen: { category: 'voice', path: 'assets/sounds/voice/voice_undeafen.mp3', preload: false },
            
            // Presence (lazy)
            user_join: { category: 'presence', path: 'assets/sounds/presence/user_join.mp3', preload: false, cooldown: 200 },
            user_leave: { category: 'presence', path: 'assets/sounds/presence/user_leave.mp3', preload: false, cooldown: 200 },
            
            // App (lazy, splash only once)
            app_splash: { category: 'app', path: 'assets/sounds/app/app_splash.mp3', preload: false, oncePerSession: true }
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

        // Session constraint logic
        if (config.oncePerSession) {
            if (eventName === 'app_splash' && this.hasPlayedSplash) {
                return;
            }
        }

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
        
        // Overlap prevention: reset time to start before playing again
        if (!audio.paused && !config.loop) {
            audio.currentTime = 0;
        }

        // Special handling for app_splash (internally timed to stop after roughly 3 seconds to avoid indefinite play if it's long)
        if (eventName === 'app_splash') {
            sessionStorage.setItem('hasPlayedSplash', 'true');
            this.hasPlayedSplash = true;
            
            // We can add a fade-out logic or just rely on the clip being short
            audio.play().catch(e => console.warn('[SoundManager] Play failed:', e));
            return;
        }

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

document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-sound]');
    if (el && window.SoundManager) {
        const soundName = el.getAttribute('data-sound');
        window.SoundManager.play(soundName);
    }
});
