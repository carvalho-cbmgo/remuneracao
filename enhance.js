// ============================================================================
// Camada de reforço visual — puramente cosmética.
// Não lê nem grava nenhum estado usado pelos cálculos de app.js: apenas
// classes/estilos auxiliares. Se algo aqui falhar, o simulador continua
// funcionando normalmente.
// ============================================================================

(function ripple(){
  try {
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    document.addEventListener("pointerdown", function (e) {
      var btn = e.target.closest && e.target.closest(".btn");
      if (!btn) return;
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 1.8;
      var span = document.createElement("span");
      span.className = "ripple";
      span.style.width = span.style.height = size + "px";
      span.style.left = (e.clientX - rect.left - size / 2) + "px";
      span.style.top = (e.clientY - rect.top - size / 2) + "px";
      btn.appendChild(span);
      window.setTimeout(function () { span.remove(); }, 700);
    });
  } catch (e) { /* puramente decorativo */ }
})();

(function reajusteFill(){
  try {
    var range = document.getElementById("reajusteRange");
    if (!range) return;
    var last = null;
    function sync(){
      var min = parseFloat(range.min) || 0;
      var max = parseFloat(range.max) || 100;
      var val = parseFloat(range.value);
      if (!Number.isFinite(val)) val = 0;
      if (val !== last) {
        last = val;
        var pct = ((val - min) / (max - min)) * 100;
        if (!Number.isFinite(pct)) pct = 0;
        pct = Math.max(0, Math.min(100, pct));
        range.style.setProperty("--fill", pct + "%");
      }
      requestAnimationFrame(sync);
    }
    requestAnimationFrame(sync);
  } catch (e) { /* puramente decorativo */ }
})();

(function valuePulse(){
  try {
    if (typeof MutationObserver === "undefined") return;
    var ids = [
      "totalBrutoHeader", "totalDescontosHeader", "resumoLiquidoHeader",
      "feriasLiquidoHeader", "decimoLiquidoHeader", "ferias13TotLiquidoHeader",
      "ferias13BoxLiquidoHeader", "detalhamentoAnualTotalHeader",
      "valoresAnuaisProventos", "valoresAnuaisDescontos", "valoresAnuaisLiquido",
      "valoresAnuaisMediaLiquida"
    ];
    var targets = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!targets.length) return;

    function pulse(el){
      var host = (el.closest && el.closest(".resume-box, .annual-stat, .f13-card")) || el;
      host.classList.remove("value-pulse");
      void host.offsetWidth;
      host.classList.add("value-pulse");
    }

    var obs = new MutationObserver(function (mutations) {
      var hosts = new Set();
      mutations.forEach(function (m) {
        var el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!el) return;
        var match = targets.filter(function (t) { return t === el || t.contains(el); })[0];
        if (match) hosts.add(match);
      });
      hosts.forEach(pulse);
    });
    targets.forEach(function (t) {
      obs.observe(t, { childList: true, characterData: true, subtree: true });
    });
  } catch (e) { /* puramente decorativo */ }
})();

(function revealResultado(){
  try {
    var resultado = document.getElementById("resultado");
    if (!resultado || typeof MutationObserver === "undefined") return;
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var revealed = false;
    var obs = new MutationObserver(function () {
      if (!resultado.hidden && !revealed) {
        revealed = true;
        resultado.classList.add("reveal-in");
        resultado.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      } else if (resultado.hidden) {
        revealed = false;
        resultado.classList.remove("reveal-in");
      }
    });
    obs.observe(resultado, { attributes: true, attributeFilter: ["hidden"] });
  } catch (e) { /* puramente decorativo */ }
})();

(function reajusteButtonState(){
  try {
    var btn = document.getElementById("simularReajuste");
    var wrap = document.getElementById("reajusteWrap");
    if (!btn || !wrap) return;
    btn.addEventListener("click", function () {
      var isOpen = !wrap.classList.contains("hidden");
      btn.setAttribute("aria-pressed", String(isOpen));
      btn.classList.toggle("is-active", isOpen);
    });
  } catch (e) { /* puramente decorativo */ }
})();

(function ac4QtyAffordance(){
  try {
    var modal = document.getElementById("ac4Modal");
    if (!modal) return;
    var days = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

    function syncQty(day){
      var cb = modal.querySelector('.ac4-check[data-day="' + day + '"]');
      var sel = modal.querySelector('.ac4-qty[data-day="' + day + '"]');
      if (!cb || !sel) return;
      sel.disabled = !cb.checked;
    }
    function syncAll(){ days.forEach(syncQty); }

    modal.addEventListener("change", function (e) {
      if (e.target && e.target.matches && e.target.matches(".ac4-check")) {
        syncQty(e.target.dataset.day);
      }
    });

    if (typeof MutationObserver !== "undefined") {
      var obs = new MutationObserver(function () {
        if (!modal.classList.contains("hidden")) syncAll();
      });
      obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
    }
    syncAll();
  } catch (e) { /* puramente decorativo */ }
})();
