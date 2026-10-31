// Shared by sidebar and avatar panel. The mascot is sized by CSS to fit its frame; JS only handles click-to-wave and the animate toggle.
(function () {
  const vscode = acquireVsCodeApi();
  window.tami = { post: (m) => vscode.postMessage(m) };
  const bot = document.getElementById('bot');
  const init = JSON.parse(document.getElementById('bot-state').textContent);
  bot.classList.toggle('animate', !!init.animate);
  bot.addEventListener('click', () => bot.classList.add('wave'));
  bot.addEventListener('animationend', (e) => { if (e.animationName === 'wave' || e.animationName === 'hop') bot.classList.remove('wave'); });
  window.addEventListener('message', (e) => { if (e.data.type === 'animate') bot.classList.toggle('animate', !!e.data.value); });
})();
