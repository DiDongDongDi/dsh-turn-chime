// dsh-turn-chime — client half
//
// 订阅宿主已经提供的 sessions 列表。某条非 subagent 会话的 running
// 从 true 变为 false 时，响一声短音，并在通知权限已授予时弹一条系统通知。
// 不 import 任何包；factory 不 require 平台 seed。
window.__ModuleLoader__.load({
	id: "dsh-turn-chime",
	factory: () => {
		const module = { exports: {} };
		const exports = module.exports;

		const inject = ["sessions"];

		function titleOf(row, id) {
			const projected = row && row.projectionValues && row.projectionValues.title;
			if (typeof projected === "string" && projected !== "") return projected;
			if (row && typeof row.displayTitle === "string" && row.displayTitle !== "") return row.displayTitle;
			if (row && typeof row.title === "string" && row.title !== "") return row.title;
			return id;
		}

		function apply(ctx) {
			const list = ctx.sessions && ctx.sessions.list;
			if (list === undefined || typeof list.subscribe !== "function" || typeof list.getSnapshot !== "function") {
				return;
			}

			const prevRunning = new Map();
			let audioCtx = null;
			let primed = false;

			function audioContext() {
				const Ctor = window.AudioContext || window.webkitAudioContext;
				if (Ctor === undefined) return null;
				if (audioCtx === null) audioCtx = new Ctor();
				return audioCtx;
			}

			function prime() {
				if (primed) return;
				primed = true;
				try {
					const current = audioContext();
					if (current !== null && current.state === "suspended") current.resume();
				} catch {
					/* 自动播放策略未放开时，下一次点击再试 */
				}
				if (typeof Notification !== "undefined" && Notification.permission === "default") {
					const pending = Notification.requestPermission();
					if (pending !== undefined && typeof pending.catch === "function") pending.catch(() => {});
				}
			}

			if (typeof document !== "undefined") {
				document.addEventListener("pointerdown", prime, { once: true });
			}

			function chime() {
				try {
					const current = audioContext();
					if (current === null) return;
					if (current.state === "suspended") current.resume();
					const osc = current.createOscillator();
					const gain = current.createGain();
					const start = current.currentTime;
					osc.type = "sine";
					osc.frequency.setValueAtTime(880, start);
					osc.frequency.exponentialRampToValueAtTime(660, start + 0.18);
					gain.gain.setValueAtTime(0.0001, start);
					gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
					gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
					osc.connect(gain);
					gain.connect(current.destination);
					osc.start(start);
					osc.stop(start + 0.3);
				} catch {
					/* 没有音频设备或上下文被拒绝时静默 */
				}
			}

			function notify(row, id) {
				if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
				const name = titleOf(row, id);
				try {
					// macOS 横幅常只展示 body，标题会被站点名盖住，所以名称两边都写。
					new Notification(name, {
						body: name,
						tag: "dsh-turn-chime:" + id
					});
				} catch {
					/* 权限在弹出前被收回 */
				}
			}

			function check() {
				const snap = list.getSnapshot();
				if (snap === undefined || snap === null || snap.byId === undefined) return;
				const ids = Array.isArray(snap.ids) ? snap.ids : Object.keys(snap.byId);
				for (const id of ids) {
					const row = snap.byId[id];
					if (row === undefined || row.origin === "subagent" || row.blank === true) continue;
					const running = row.running === true;
					const was = prevRunning.get(id);
					if (was === true && !running) {
						chime();
						notify(row, id);
					}
					prevRunning.set(id, running);
				}
			}

			const off = list.subscribe(check);
			if (typeof ctx.effect === "function") ctx.effect(() => off);
			check();
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
