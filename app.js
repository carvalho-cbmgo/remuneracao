// ====== Utilidades ======
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM_BR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoney = (str) => {
  if (!str) return 0;
  return Number(String(str).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
};
const fmt = (n) => BRL.format(Number(n || 0).toFixed ? Number(n).toFixed(2) : Number(n));
const fmtSemMoeda = (n) => NUM_BR.format(Number(n || 0).toFixed ? Number(n).toFixed(2) : Number(n));
const formatReajusteDelta = (delta, base) => {
  if (!Number.isFinite(delta)) return "";
  const amountSign = delta >= 0 ? "+" : "-";
  const pct = base ? (delta / base) * 100 : 0;
  const pctSign = pct >= 0 ? "+" : "-";
  return `(${amountSign}${fmt(Math.abs(delta))} | ${pctSign}${Math.abs(pct).toFixed(2).replace(".", ",")}%)`;
};
const setReajusteDeltaAttr = (id, text) => {
  const el = byId(id);
  if (!el) return;
  if (text && text.trim()) el.setAttribute("data-delta", text);
  else el.removeAttribute("data-delta");
};
const clearReajusteDeltaAttrs = (ids) => ids.forEach((id) => setReajusteDeltaAttr(id, ""));

const byId = (id) => document.getElementById(id);
const tbodyProventos = byId("tbodyProventos");
const tbodyDescontos = byId("tbodyDescontos");

// ====== Tabela de Subsídio Efetivo por Posto/Graduação, por período vigente ======
// Cada item cobre um intervalo de meses/anos (inclusive) com a tabela oficial
// publicada no Diário Oficial para aquele intervalo. Postos/graduações com
// subsídio idêntico foram unificados numa única opção (Subtenente = Aspirante
// a oficial; 1º/2º/3º Sargento = Cadete de 3º/2º/1º ano, respectivamente).
// Novos períodos podem ser adicionados aqui conforme forem publicados.
const SUBSIDIO_PERIODOS = [
  {
    // mai/2025 a jun/2026 — "Coronel - Nível II" ainda não existia neste
    // período, por isso não consta nesta tabela.
    inicio: { ano: 2025, mes: 5 },
    fim: { ano: 2026, mes: 6 },
    tabela: {
      "Coronel - Nível I": 38703.09,
      "Tenente-Coronel": 34887.28,
      "Major": 31344.05,
      "Capitão": 27419.78,
      "1º Tenente": 19906.60,
      "2º Tenente": 17119.67,
      "Subtenente / Aspirante a Oficial": 14843.14,
      "1º Sargento / Cadete 3º ano": 12982.57,
      "2º Sargento / Cadete 2º ano": 11251.56,
      "3º Sargento / Cadete 1º ano": 10386.05,
      "Cabo": 9472.08,
      "Soldado 1ª Classe": 8625.76,
      "Soldado 2ª Classe": 7823.09
    }
  },
  {
    // jul/2026 em diante — tabela vigente (DOE/GO N° 24.809, 29/6/2026),
    // já com a criação de "Coronel - Nível II".
    inicio: { ano: 2026, mes: 7 },
    fim: { ano: 2026, mes: 12 },
    tabela: {
      "Coronel - Nível II": 48353.02,
      "Coronel - Nível I": 40294.18,
      "Tenente-Coronel": 36321.51,
      "Major": 32632.62,
      "Capitão": 28547.01,
      "1º Tenente": 20724.98,
      "2º Tenente": 17930.43,
      "Subtenente / Aspirante a Oficial": 17167.09,
      "1º Sargento / Cadete 3º ano": 13516.29,
      "2º Sargento / Cadete 2º ano": 11714.12,
      "3º Sargento / Cadete 1º ano": 10813.01,
      "Cabo": 9861.48,
      "Soldado 1ª Classe": 8980.38,
      "Soldado 2ª Classe": 8145.38
    }
  }
];

const chaveAnoMes = (ano, mes) => ano * 12 + mes;

// Retorna a tabela vigente para o (ano, mês) informado. Datas fora de todos
// os períodos cadastrados usam a tabela do período mais recente (projeção
// para o futuro), consistente com o restante do simulador.
function tabelaSubsidioPara(ano, mes) {
  const chave = chaveAnoMes(ano, mes);
  const periodo = SUBSIDIO_PERIODOS.find((p) =>
    chave >= chaveAnoMes(p.inicio.ano, p.inicio.mes) && chave <= chaveAnoMes(p.fim.ano, p.fim.mes)
  );
  return (periodo || SUBSIDIO_PERIODOS[SUBSIDIO_PERIODOS.length - 1]).tabela;
}

// Tabela do posto/graduação vigente para o período de referência selecionado.
// É reatribuída por aplicarTabelaSubsidioPorPeriodo() quando o usuário troca
// a data de referência.
let SUBSIDIO = SUBSIDIO_PERIODOS[SUBSIDIO_PERIODOS.length - 1].tabela;

// ====== Teto constitucional (abate-teto) ======
// Subteto estadual: 90,25% do subsídio de Ministro do STF (R$ 46.366,19).
const TETO_CONSTITUCIONAL = 41835.39;

// Aplica o teto constitucional sobre um valor de subsídio: retorna a base
// (limitada ao teto) que deve alimentar previdência/IR, e o excedente que
// deve aparecer como desconto "Abate-teto constitucional". Conforme
// entendimento do STF (RE 675978, Tema 639), o excedente é subtraído da
// remuneração bruta ANTES do cálculo de IR e contribuição previdenciária,
// pois esses tributos não incidem sobre valor que não é efetivamente pago.
function aplicarAbateTeto(valorSubsidio) {
  const base = Math.min(valorSubsidio, TETO_CONSTITUCIONAL);
  const excedente = round2(Math.max(0, valorSubsidio - TETO_CONSTITUCIONAL));
  return { base, excedente };
}

// ====== Constantes fixas ======
const ABONO_FARDAMENTO = 51.99;
const FARDAMENTO = 51.99;
// FAS – militar ativo: 0,35% do subsídio de Capitão, arredondado para cima
// como praticado na folha oficial (R$ 99,92 na tabela de 2026).
function calcularFas() {
  return Math.ceil(SUBSIDIO["Capitão"] * 0.0035 * 100) / 100;
}
let FAS = calcularFas();
const ALIQUOTA_PENSAO = 0.105;
const IPASGO_TETO_BASICO = 838.71;
const IPASGO_TETO_ESPECIAL = 1247.93;

// Troca a tabela de subsídio ativa para o (ano, mês) informado (usada pelo
// seletor #mesAno) e atualiza as opções de "Posto / Graduação" de acordo.
function aplicarTabelaSubsidioPorPeriodo(ano, mes) {
  SUBSIDIO = tabelaSubsidioPara(ano, mes);
  FAS = calcularFas();
}

// Reconstrói as opções de "Posto / Graduação" a partir dos postos existentes
// na tabela de subsídio atualmente ativa (ex.: "Coronel - Nível II" só
// aparece a partir de jul/2026). Mantém o posto selecionado se ele ainda
// existir na nova tabela; caso contrário, volta ao placeholder.
function renderPostoOptions() {
  const postoSel = byId("posto");
  if (!postoSel) return;
  const valorAtual = postoSel.value;
  const opcoes = Object.keys(SUBSIDIO);
  const mantemSelecao = opcoes.includes(valorAtual);
  postoSel.innerHTML =
    `<option value="" disabled${mantemSelecao ? "" : " selected"}>Selecione...</option>` +
    opcoes.map((p) => `<option value="${escapeHtml(p)}"${p === valorAtual ? " selected" : ""}>${escapeHtml(p)}</option>`).join("");
}

// ====== Seletor unificado de mês/ano de referência (#mesAno) ======
// Opções no formato "jan/2025", geradas a partir do intervalo coberto por
// SUBSIDIO_PERIODOS (do início do primeiro período ao fim do último). O
// <select id="mes"> oculto continua sendo a fonte lida pelos cálculos; aqui
// apenas sincronizamos o mês e a tabela do período vigente.
const MESES_NOMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_ABREV = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

// Enumera todos os pares {ano, mes} entre "inicio" e "fim" (inclusive).
function enumerarMesesEntre(inicio, fim) {
  const lista = [];
  let ano = inicio.ano, mes = inicio.mes;
  while (chaveAnoMes(ano, mes) <= chaveAnoMes(fim.ano, fim.mes)) {
    lista.push({ ano, mes });
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return lista;
}

function setupMesAnoSelect() {
  const unifSel = byId("mesAno");
  const mesSel = byId("mes");
  const prevBtn = byId("mesAnoPrev");
  const nextBtn = byId("mesAnoNext");
  if (!unifSel || !mesSel) return;

  const primeiroPeriodo = SUBSIDIO_PERIODOS[0];
  const ultimoPeriodo = SUBSIDIO_PERIODOS[SUBSIDIO_PERIODOS.length - 1];
  const meses = enumerarMesesEntre(primeiroPeriodo.inicio, ultimoPeriodo.fim);

  unifSel.innerHTML = meses.map(({ ano, mes }) =>
    `<option value="${MESES_NOMES[mes - 1]}|${ano}">${MESES_ABREV[mes - 1]}/${ano}</option>`
  ).join("");

  // Habilita/desabilita os botões de navegação "◀"/"▶" ao lado do seletor
  // conforme a posição atual (não é possível ir antes de mai/2025 nem
  // depois de dez/2026, os limites de SUBSIDIO_PERIODOS).
  const atualizarBotoesNav = () => {
    if (prevBtn) prevBtn.disabled = unifSel.selectedIndex <= 0;
    if (nextBtn) nextBtn.disabled = unifSel.selectedIndex >= unifSel.options.length - 1;
  };

  const aplicarSelecao = (recalcular) => {
    const [nomeMes, anoStr] = String(unifSel.value || "").split("|");
    const mesIdx = MESES_NOMES.indexOf(nomeMes);
    const ano = Number(anoStr) || ultimoPeriodo.inicio.ano;
    const mes = mesIdx >= 0 ? mesIdx + 1 : ultimoPeriodo.inicio.mes;
    if (nomeMes) mesSel.value = nomeMes;
    aplicarTabelaSubsidioPorPeriodo(ano, mes);
    renderPostoOptions();
    atualizarBotoesNav();
    if (!recalcular) return;
    // A partir daqui é seguro referenciar bindings declaradas mais abaixo no
    // arquivo (ex.: adicionaisSelect/adicionaisSelecionados): este trecho só
    // roda em resposta à troca do usuário no seletor, ou seja, depois que o
    // script inteiro já terminou de ser avaliado.
    if (typeof atualizarDisponibilidadeAC5 === "function") atualizarDisponibilidadeAC5(ano, mes);
    if (typeof atualizarValoresAC2AC3 === "function") atualizarValoresAC2AC3(ano, mes);
    const modalSubs = byId("subsidiosModal");
    if (typeof renderSubsidiosTable === "function" && modalSubs && !modalSubs.classList.contains("hidden")) {
      renderSubsidiosTable();
    }
    if (typeof recomputePercentFromValor === "function") recomputePercentFromValor();
    if (typeof recalcularComIndicadorDeCarregamento === "function") recalcularComIndicadorDeCarregamento();
  };
  // Referência inicial: início do período mais recente (jul/2026), que é a
  // tabela em vigor mais atual conhecida pelo simulador.
  unifSel.value = `${MESES_NOMES[ultimoPeriodo.inicio.mes - 1]}|${ultimoPeriodo.inicio.ano}`;
  aplicarSelecao(false);
  unifSel.addEventListener("change", () => aplicarSelecao(true));

  const irParaMes = (delta) => {
    const novoIndice = unifSel.selectedIndex + delta;
    if (novoIndice < 0 || novoIndice >= unifSel.options.length) return;
    unifSel.selectedIndex = novoIndice;
    aplicarSelecao(true);
  };
  if (prevBtn) prevBtn.addEventListener("click", () => irParaMes(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => irParaMes(1));
}
setupMesAnoSelect();

// ====== Parâmetros IRRF Mensal 2025 (oficiais RFB) ======
// Fonte: gov.br/receitafederal - Tributação de 2025 (incidência mensal)
const PARAMS_IRRF = {
  jan_abr: {
    dependente: 189.59,
    desconto_simplificado_limite: 564.80,
    faixas: [
      { ate: 2259.20, aliquota: 0.00, deducao: 0.00 },
      { ate: 2826.65, aliquota: 0.075, deducao: 169.44 },
      { ate: 3751.05, aliquota: 0.15, deducao: 381.44 },
      { ate: 4664.68, aliquota: 0.225, deducao: 662.77 },
      { ate: Infinity, aliquota: 0.275, deducao: 896.00 },
    ]
  },
  mai_dez: {
    dependente: 189.59,
    desconto_simplificado_limite: 607.20,
    faixas: [
      { ate: 2428.80, aliquota: 0.00, deducao: 0.00 },
      { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ]
  }
};

// ====== Parâmetros IRPF Anual 2025 (Declaração de Ajuste Anual, exercício
// 2026) — oficiais RFB. Fonte: gov.br/receitafederal, Tributação de 2025/
// tabela anual (Lei nº 15.191/2025). Distinto da tabela mensal: o desconto
// simplificado anual é 20% (não 25%) do rendimento tributável, limitado a
// R$ 16.754,34; a dedução por dependente e o limite de instrução anuais
// batem exatamente com 12x os valores mensais já usados acima.
const PARAMS_IRRF_ANUAL = {
  dependente: 2275.08,
  educacao_limite: 3561.50,
  desconto_simplificado_aliquota: 0.20,
  desconto_simplificado_limite: 16754.34,
  pgbl_aliquota_limite: 0.12,
  faixas: [
    { ate: 28467.20, aliquota: 0.00, deducao: 0.00 },
    { ate: 33919.80, aliquota: 0.075, deducao: 2135.04 },
    { ate: 45012.60, aliquota: 0.15, deducao: 4679.03 },
    { ate: 55976.16, aliquota: 0.225, deducao: 8054.97 },
    { ate: Infinity, aliquota: 0.275, deducao: 10853.78 },
  ]
};

// ====== Simulador de Restituição IRPF ======
// Reconciliação anual (Declaração de Ajuste Anual): recalcula o imposto
// devido no ano inteiro usando as deduções informadas pelo usuário (regime
// completo) ou o desconto simplificado anual — o que for maior — e compara
// com o IRPF já retido mês a mês (calculado em computeDetalhamento). A
// diferença é a restituição (retido > devido) ou o imposto a pagar
// (devido > retido).
function simularRestituicaoIRPF(){
  const box = byId("irpfSimBox");
  if (!box || !__irpfAnualDados) return;

  const { rendimentoTributavelAnual, irpfRetidoAnual, pensaoOficialAnual, dependentes, ipasgoAnual } = __irpfAnualDados;

  // Despesas Médicas: campo desabilitado, sempre sincronizado com o Plano
  // de Saúde informado em "Informações de Entrada" (não é editável pelo
  // usuário — gastos médicos adicionais entram no campo "Outras Despesas
  // médicas e odontológicas", logo abaixo).
  const campoMedicas = byId("irpfDespesasMedicas");
  if (campoMedicas) {
    campoMedicas.value = ipasgoAnual > 0 ? fmtSemMoeda(ipasgoAnual) : "";
  }

  const lerCampo = (id) => { const el = byId(id); return el ? parseMoney(el.value) : 0; };
  const despesasMedicas = round2(lerCampo("irpfDespesasMedicas") + lerCampo("irpfOutrasDespesasMedicas"));
  const educacaoInformada = lerCampo("irpfDespesasEducacao");
  const pensaoAlimenticia = lerCampo("irpfPensaoAlimenticia");
  const pgblInformado = lerCampo("irpfPGBL");

  const dependentesAnualDeducao = round2(PARAMS_IRRF_ANUAL.dependente * dependentes);
  const educacaoLimiteTotal = round2(PARAMS_IRRF_ANUAL.educacao_limite * (1 + dependentes));
  const educacaoDeduzida = Math.min(educacaoInformada, educacaoLimiteTotal);
  const pgblLimite = round2(rendimentoTributavelAnual * PARAMS_IRRF_ANUAL.pgbl_aliquota_limite);
  const pgblDeduzido = Math.min(pgblInformado, pgblLimite);

  const deducoesLegaisAnuais = round2(
    pensaoOficialAnual + dependentesAnualDeducao + despesasMedicas + educacaoDeduzida + pensaoAlimenticia + pgblDeduzido
  );
  const descontoSimplificadoAnual = Math.min(
    round2(rendimentoTributavelAnual * PARAMS_IRRF_ANUAL.desconto_simplificado_aliquota),
    PARAMS_IRRF_ANUAL.desconto_simplificado_limite
  );

  // Método de dedução escolhido explicitamente pelo usuário — o desconto
  // simplificado SUBSTITUI todas as demais deduções (inclusive a
  // previdência oficial), não se soma a elas; por isso as duas opções são
  // mutuamente exclusivas, nunca combinadas.
  const metodoSel = byId("irpfMetodoDeducao");
  const usaSimplificado = metodoSel ? metodoSel.value === "simplificado" : false;
  const descontoAplicadoAnual = usaSimplificado ? descontoSimplificadoAnual : deducoesLegaisAnuais;

  // Desabilita visualmente os campos de dedução que não contam quando o
  // desconto simplificado está selecionado (ele os substitui por completo).
  ["irpfOutrasDespesasMedicas", "irpfDespesasEducacao", "irpfPensaoAlimenticia", "irpfPGBL"].forEach((id) => {
    const el = byId(id);
    if (el) el.disabled = usaSimplificado;
  });

  let baseCalcAnual = round2(rendimentoTributavelAnual - descontoAplicadoAnual);
  if (baseCalcAnual < 0) baseCalcAnual = 0;

  let aliquotaAnual = 0, deducaoAnual = 0;
  for (const faixa of PARAMS_IRRF_ANUAL.faixas) {
    if (baseCalcAnual <= faixa.ate) { aliquotaAnual = faixa.aliquota; deducaoAnual = faixa.deducao; break; }
  }
  let impostoDevidoAnual = round2(baseCalcAnual * aliquotaAnual - deducaoAnual);
  if (impostoDevidoAnual < 0) impostoDevidoAnual = 0;

  const resultado = round2(irpfRetidoAnual - impostoDevidoAnual);

  const set = (id, txt) => { const el = byId(id); if (el) el.textContent = txt; };
  set("irpfDependentesInfo", `${dependentes} dependente(s) · dedução ${fmt(dependentesAnualDeducao)}`);
  set("irpfEducacaoLimiteInfo", `Limite dedutível: ${fmt(educacaoLimiteTotal)} (R$ 3.561,50 × ${1 + dependentes} declarante/dependente${dependentes ? "s" : ""})`);
  set("irpfPgblLimiteInfo", `Limite dedutível: ${fmt(pgblLimite)} (12% do rendimento tributável anual)`);
  set("irpfRendimentoAnual", fmt(rendimentoTributavelAnual));
  set("irpfMetodo", usaSimplificado
    ? `Desconto simplificado (${fmt(descontoSimplificadoAnual)})`
    : `Deduções legais (${fmt(deducoesLegaisAnuais)})`);
  set("irpfBaseCalculo", fmt(baseCalcAnual));
  set("irpfDevido", fmt(impostoDevidoAnual));
  set("irpfRetido", fmt(irpfRetidoAnual));

  const labelEl = byId("irpfResultadoLabel");
  const valorEl = byId("irpfResultadoValor");
  const lineEl = byId("irpfResultadoLine");
  const headerEl = byId("irpfResultadoHeader");
  if (labelEl && valorEl) {
    if (resultado >= 0) {
      labelEl.textContent = "IRPF a restituir";
      valorEl.textContent = fmt(resultado);
      if (lineEl) { lineEl.classList.remove("irpf-a-pagar"); lineEl.classList.add("irpf-a-restituir"); }
      if (headerEl) { headerEl.textContent = `A restituir ${fmt(resultado)}`; headerEl.classList.remove("vermelho"); headerEl.classList.add("verde"); }
    } else {
      labelEl.textContent = "IRPF a pagar";
      valorEl.textContent = fmt(Math.abs(resultado));
      if (lineEl) { lineEl.classList.remove("irpf-a-restituir"); lineEl.classList.add("irpf-a-pagar"); }
      if (headerEl) { headerEl.textContent = `A pagar ${fmt(Math.abs(resultado))}`; headerEl.classList.remove("verde"); headerEl.classList.add("vermelho"); }
    }
  }
}

// Máscara monetária + recálculo ao digitar nos campos do simulador de IRPF
// ("irpfDespesasMedicas" fica de fora: é desabilitado, sempre carregado a
// partir do Plano de Saúde — ver simularRestituicaoIRPF).
["irpfOutrasDespesasMedicas", "irpfDespesasEducacao", "irpfPensaoAlimenticia", "irpfPGBL"].forEach((id) => {
  const el = byId(id);
  if (!el) return;
  el.addEventListener("input", (e) => {
    let v = e.target.value.replace(/[^\d,\.]/g, "");
    const parts = v.split(",");
    if (parts.length > 2) v = parts[0] + "," + parts.slice(1).join("");
    e.target.value = v;
    simularRestituicaoIRPF();
  });
});
byId("irpfMetodoDeducao")?.addEventListener("change", () => simularRestituicaoIRPF());

// ====== Dinâmica de campos ======
const ipasgoSel = byId("ipasgo");
const ipasgoManualInfo = byId("ipasgoManualInfo");
const ipasgoPercentBadge = byId("ipasgoPercentBadge");
const grupoIpasgoValor = byId("grupoIpasgoValor");
const valorIpasgoInput = byId("valorIpasgo");
const ipasgoPercentInput = byId("ipasgoPercent");
const btnReajuste = byId('simularReajuste');
const reajusteWrap = byId('reajusteWrap');
const reajustePercentInput = byId('reajustePercent');
const adicionaisSelect = byId("adicionaisSelect");
const adicionaisChips = byId("adicionaisChips");
const ac4Modal = byId("ac4Modal");
const ac4TotalPreview = byId("ac4TotalPreview");
const ac4RowsEl = byId("ac4Rows");
const ac4AddBtn = byId("ac4AddServico");
const ac4ConfirmBtn = byId("ac4Confirm");
const ac4CancelBtn = byId("ac4Cancel");
const infoSubsidiosBtn = byId("infoSubsidiosBtn");
const subsidiosModal = byId("subsidiosModal");
const tbodySubsidios = byId("tbodySubsidios");
const subsidiosCloseBtn = byId("subsidiosClose");
const historicoBtn = byId("historicoBtn");
const historicoModal = byId("historicoModal");
const tbodyHistorico = byId("tbodyHistorico");
const historicoCloseBtn = byId("historicoClose");
const btnComparar = byId("btnComparar");
const compararModal = byId("compararModal");
const compararPostoSelect = byId("compararPostoSelect");
const compararCloseBtn = byId("compararClose");
const compararCancelarBtn = byId("compararCancelar");
const compararExecutarBtn = byId("compararExecutar");
const compararResultadoModal = byId("compararResultadoModal");
const compararResultadoCloseBtn = byId("compararResultadoClose");
// AC2 e AC3 têm valores diferentes conforme a data de referência: de
// mai/2025 a jun/2026 valem R$ 700,00 e R$ 552,00; a partir de jul/2026,
// R$ 1.050,00 e R$ 828,00. Reatribuídos por atualizarValoresAC2AC3().
let AC2_VALOR = 1050.00;
let AC3_VALOR = 828.00;
const AC5_VALOR = 1000.00;
const AC4_TOTAL_24H = {
  seg: 729.03,
  ter: 729.03,
  qua: 729.03,
  qui: 762.06,
  sex: 1005.94,
  sab: 1005.94,
  dom: 972.91
};
const AC4_LABEL_DIA = {
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
  sab: "Sab",
  dom: "Dom"
};
// Dia seguinte no ciclo da semana, usado para ratear um serviço que
// ultrapassa a meia-noite entre o dia de início e o dia seguinte.
const AC4_PROXIMO_DIA = {
  seg: "ter", ter: "qua", qua: "qui", qui: "sex", sex: "sab", sab: "dom", dom: "seg"
};
const AC_LABELS = {
  AC2: "AC2 (Horas-Aulas Ministradas)",
  AC3: "AC3 (Indenização por localidade)",
  AC4: "AC4 (Indenização por Serviço Extraordinário)",
  AC5: "AC5 (Auxílio Alimentação)"
};
let adicionaisSelecionados = new Set(["AC5"]);

// AC5 (Auxílio Alimentação) só passou a existir a partir de jul/2026. Em
// datas de referência anteriores, a opção fica indisponível no seletor de
// Adicionais e é removida da simulação, se estiver presente. A partir de
// jul/2026 (inclusive), o AC5 é incluído automaticamente na simulação toda
// vez que essa data de referência for selecionada.
const AC5_DISPONIVEL_DESDE = { ano: 2026, mes: 7 };
function atualizarDisponibilidadeAC5(ano, mes) {
  const disponivel = chaveAnoMes(ano, mes) >= chaveAnoMes(AC5_DISPONIVEL_DESDE.ano, AC5_DISPONIVEL_DESDE.mes);
  if (adicionaisSelect) {
    const opt = adicionaisSelect.querySelector('option[value="AC5"]');
    if (disponivel && !opt) {
      adicionaisSelect.insertAdjacentHTML("beforeend", `<option value="AC5">${AC_LABELS.AC5}</option>`);
    } else if (!disponivel && opt) {
      opt.remove();
    }
  }
  if (disponivel && !adicionaisSelecionados.has("AC5")) {
    adicionaisSelecionados.add("AC5");
    renderAdicionaisChips();
  } else if (!disponivel && adicionaisSelecionados.has("AC5")) {
    adicionaisSelecionados.delete("AC5");
    renderAdicionaisChips();
  }
  return disponivel;
}

// AC2 e AC3: valores vigentes de mai/2025 a jun/2026 eram menores; a partir
// de jul/2026 passam a valer R$ 1.050,00 e R$ 828,00 (mesmo corte de
// AC5_DISPONIVEL_DESDE).
const AC2_AC3_VALOR_ANTIGO = { AC2: 700.00, AC3: 552.00 };
const AC2_AC3_VALOR_ATUAL = { AC2: 1050.00, AC3: 828.00 };
function atualizarValoresAC2AC3(ano, mes) {
  const vigenteAtual = chaveAnoMes(ano, mes) >= chaveAnoMes(AC5_DISPONIVEL_DESDE.ano, AC5_DISPONIVEL_DESDE.mes);
  const tabela = vigenteAtual ? AC2_AC3_VALOR_ATUAL : AC2_AC3_VALOR_ANTIGO;
  AC2_VALOR = tabela.AC2;
  AC3_VALOR = tabela.AC3;
}
// Insumos anuais (rendimento tributável, IRPF já retido etc.) capturados ao
// final de computeDetalhamento(), usados pelo Simulador de Restituição IRPF.
let __irpfAnualDados = null;
let ac4Config = buildAc4DefaultConfig();
let ac4DraftConfig = buildAc4DefaultConfig();
let ac4EntrySeq = 0;
let __reajustePercent = 0;
const MAX_REAJUSTE_PERCENT = 30;
const MIN_REAJUSTE_PERCENT = 0;
ipasgoSel.addEventListener("change", () => {
  const show = ipasgoSel.value === "manual";
  if (grupoIpasgoValor) grupoIpasgoValor.classList.toggle("hidden", !show);
  recomputePercentFromValor();
  recalcularComIndicadorDeCarregamento();
});

// AC4 agora é uma lista de serviços extraordinários
// ({ id, day, inicio, horas }), um item por linha adicionada na janela de
// cálculo (ver renderAc4Rows).
function buildAc4DefaultConfig(){
  return [];
}

function cloneAc4Config(cfg){
  return JSON.parse(JSON.stringify(cfg || buildAc4DefaultConfig()));
}

// Valor por hora do dia = valor do serviço extraordinário de 24h ÷ 24.
function ac4ValorHora(day){
  return (AC4_TOTAL_24H[day] || 0) / 24;
}

// Calcula o valor de um serviço que começa em "day" às "inicio"h e dura
// "horas"h. Se ultrapassar a meia-noite, rateia proporcionalmente entre o
// dia de início e o dia seguinte (ex.: quarta 24h iniciando às 12h = 12h
// pelo valor-hora de quarta + 12h pelo valor-hora de quinta).
function calcAc4Servico(day, inicio, horas){
  const partes = [];
  if (AC4_TOTAL_24H[day]) {
    const horasNoDia = Math.max(0, Math.min(horas, 24 - inicio));
    if (horasNoDia > 0) partes.push({ day, horas: horasNoDia });
    const restante = round2(horas - horasNoDia) > 0 ? horas - horasNoDia : 0;
    if (restante > 0) {
      const proximo = AC4_PROXIMO_DIA[day];
      if (AC4_TOTAL_24H[proximo]) partes.push({ day: proximo, horas: restante });
    }
  }
  let valor = 0;
  partes.forEach((p) => { valor += ac4ValorHora(p.day) * p.horas; });
  return { valor: round2(valor), partes };
}

// Soma o valor de cada linha já arredondado (o mesmo valor exibido em
// "R$ Serviço"), para o "R$ Total de AC4" sempre bater com a soma visível
// das linhas.
function calcAc4Total(cfg){
  let total = 0;
  (cfg || []).forEach((item) => {
    if (!item || !AC4_TOTAL_24H[item.day]) return;
    const horas = Math.max(0, Math.min(24, Number(item.horas ?? 0)));
    const inicio = Math.max(0, Math.min(23, Number(item.inicio ?? 0)));
    total += calcAc4Servico(item.day, inicio, horas).valor;
  });
  return round2(total);
}

function getAdicionaisCalculo(){
  const items = [];
  let totalTributavel = 0;
  let totalIsento = 0;
  if (adicionaisSelecionados.has("AC2")) {
    items.push({ sigla: "AC2", desc: AC_LABELS.AC2, valor: AC2_VALOR, isento: true });
    totalIsento += AC2_VALOR;
  }
  if (adicionaisSelecionados.has("AC3")) {
    items.push({ sigla: "AC3", desc: AC_LABELS.AC3, valor: AC3_VALOR, isento: true });
    totalIsento += AC3_VALOR;
  }
  if (adicionaisSelecionados.has("AC4")) {
    const ac4Total = calcAc4Total(ac4Config);
    items.push({ sigla: "AC4", desc: AC_LABELS.AC4, valor: ac4Total, isento: true });
    totalIsento += ac4Total;
  }
  if (adicionaisSelecionados.has("AC5")) {
    items.push({ sigla: "AC5", desc: AC_LABELS.AC5, valor: AC5_VALOR, isento: true });
    totalIsento += AC5_VALOR;
  }
  return {
    items,
    totalTributavel: round2(totalTributavel),
    totalIsento: round2(totalIsento),
    total: round2(totalTributavel + totalIsento)
  };
}

// Renderiza a lista de serviços extraordinários já adicionados ao rascunho
// (ac4DraftConfig) e atualiza o total. Cada linha mostra, da esquerda para
// a direita: número da linha, Dia, horário/duração (com o rateio entre
// dias quando o serviço ultrapassa a meia-noite) e o valor em R$.
function renderAc4Rows(){
  if (!ac4TotalPreview) return;
  if (ac4RowsEl){
    if (!ac4DraftConfig.length){
      ac4RowsEl.innerHTML = `<p class="ac4-rows-empty muted">Nenhum serviço adicionado ainda.</p>`;
    } else {
      ac4RowsEl.innerHTML = ac4DraftConfig.map((item, idx) => {
        const dia = AC4_LABEL_DIA[item.day] || item.day;
        const { valor, partes } = calcAc4Servico(item.day, item.inicio, item.horas);
        const splitNote = partes.length > 1
          ? `<span class="ac4-row-split">${partes.map((p) => `${p.horas}h em ${escapeHtml(AC4_LABEL_DIA[p.day] || p.day)}`).join(" + ")}</span>`
          : "";
        return `
          <div class="ac4-row">
            <span class="ac4-row-num">${idx + 1}</span>
            <span class="ac4-row-day">${escapeHtml(dia)}</span>
            <span class="ac4-row-info">
              <span class="ac4-row-horas">${item.horas}h a partir das ${item.inicio}h</span>
              ${splitNote}
            </span>
            <strong class="ac4-row-valor">${fmt(valor)}</strong>
            <button type="button" class="ac4-row-remove" data-ac4-remove="${item.id}" aria-label="Remover serviço ${idx + 1}, ${escapeHtml(dia)}, ${item.horas}h a partir das ${item.inicio}h">
              <svg class="icon" aria-hidden="true"><use href="#i-close"></use></svg>
            </button>
          </div>`;
      }).join("");
    }
  }
  ac4TotalPreview.textContent = fmt(calcAc4Total(ac4DraftConfig));
}

// Zera os seletores de dia/horas/início (área de montagem de uma nova
// linha) e redesenha a lista com os serviços já confirmados para este
// posto/mês.
function syncAc4ModalInputs(){
  if (!ac4Modal) return;
  const checks = ac4Modal.querySelectorAll(".ac4-day input[type='checkbox']");
  checks.forEach((el) => {
    el.checked = false;
    const day = el.dataset.day;
    const qtyEl = ac4Modal.querySelector(`.ac4-qty[data-day='${day}']`);
    if (qtyEl){
      qtyEl.value = "0";
      qtyEl.disabled = true;
    }
    const inicioEl = ac4Modal.querySelector(`.ac4-inicio[data-day='${day}']`);
    if (inicioEl){
      inicioEl.value = "0";
      inicioEl.disabled = true;
    }
  });
  renderAc4Rows();
}

function openAc4Modal(){
  if (!ac4Modal) return;
  ac4DraftConfig = cloneAc4Config(ac4Config);
  ac4Modal.classList.remove("hidden");
  syncAc4ModalInputs();
}

function closeAc4Modal(){
  if (!ac4Modal) return;
  ac4Modal.classList.add("hidden");
}

function renderSubsidiosTable(){
  if (!tbodySubsidios) return;
  tbodySubsidios.innerHTML = Object.entries(SUBSIDIO).map(([posto, valor]) => `
    <tr>
      <td>${escapeHtml(posto)}</td>
      <td>${fmt(valor)}</td>
    </tr>
  `).join("");
}

function openSubsidiosModal(){
  if (!subsidiosModal) return;
  renderSubsidiosTable();
  subsidiosModal.classList.remove("hidden");
  if (infoSubsidiosBtn) infoSubsidiosBtn.setAttribute("aria-expanded", "true");
  if (subsidiosCloseBtn) subsidiosCloseBtn.focus();
}

function closeSubsidiosModal(){
  if (!subsidiosModal) return;
  subsidiosModal.classList.add("hidden");
  if (infoSubsidiosBtn) {
    infoSubsidiosBtn.setAttribute("aria-expanded", "false");
    infoSubsidiosBtn.focus();
  }
}

function bindSubsidiosModal(){
  if (infoSubsidiosBtn){
    infoSubsidiosBtn.addEventListener("click", openSubsidiosModal);
  }
  if (subsidiosCloseBtn){
    subsidiosCloseBtn.addEventListener("click", closeSubsidiosModal);
  }
  if (subsidiosModal){
    subsidiosModal.addEventListener("click", (e) => {
      if (e.target === subsidiosModal) closeSubsidiosModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && subsidiosModal && !subsidiosModal.classList.contains("hidden")){
      closeSubsidiosModal();
    }
  });
}

// ====== Histórico de alterações de subsídios e adicionais (CBMGO) ======
// Registro manual das mudanças normativas (DOE) que alteraram os valores
// usados neste simulador. Cada item deve trazer o DOE que fundamenta as
// alterações listadas. Ordenado do mais recente para o mais antigo.
const HISTORICO_ALTERACOES = [
  {
    referencia: "Julho/2026",
    doeNumero: "24.809",
    doeData: "29/6/2026",
    doeSuplemento: false,
    doeUrl: "https://diariooficial.abc.go.gov.br/portal/edicoes/download/7247",
    descricao: "Pacote de valorização da Segurança Pública",
    alteracoes: [
      "Criação do posto \"Coronel - Nível II\"",
      "Alteração na remuneração do Subtenente e do Aspirante a Oficial: +15,66% (de R$ 14.843,14 para R$ 17.167,09)",
      "AC2 (Horas-Aulas Ministradas): reajuste do valor máximo, de R$ 700,00 para R$ 1.050,00",
      "AC3 (Indenização por localidade): aumento de R$ 552,00 para R$ 828,00",
      "AC4 (Indenização por Serviço Extraordinário): aumento dos valores",
      "AC5 (Auxílio Alimentação): criação do adicional, no valor de R$ 1.000,00",
    ],
  },
  {
    referencia: "Abril/2026",
    doeNumero: "24.746",
    doeData: "26/3/2026",
    doeSuplemento: true,
    doeUrl: "https://diariooficial.abc.go.gov.br/portal/edicoes/download/7112",
    descricao: "Database",
    alteracoes: [
      "Database: 4,26% (revisão geral anual dos vencimentos, dos subsídios e dos proventos do pessoal civil e militar)",
    ],
    observacao: "Também trouxe outras alterações não relacionadas a subsídios/adicionais deste simulador.",
  },
];

function renderHistoricoTable(){
  if (!tbodyHistorico) return;
  tbodyHistorico.innerHTML = HISTORICO_ALTERACOES.map((item) => {
    const doeLabel = `N° ${item.doeNumero} de ${item.doeData}` + (item.doeSuplemento ? " (Suplemento)" : "");
    const listaHtml = `<ul class="historico-alteracoes-list">${item.alteracoes.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>`;
    const obsHtml = item.observacao ? `<small class="muted historico-obs">${escapeHtml(item.observacao)}</small>` : "";
    return `
      <tr>
        <td class="historico-col-ref" data-label="Referência"><strong>${escapeHtml(item.referencia)}</strong></td>
        <td class="historico-col-doe" data-label="DOE"><a href="${escapeHtml(item.doeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(doeLabel)}</a></td>
        <td class="historico-col-desc" data-label="Descrição">${escapeHtml(item.descricao)}</td>
        <td class="historico-col-alt" data-label="Alterações">${listaHtml}${obsHtml}</td>
      </tr>`;
  }).join("");
}

function openHistoricoModal(){
  if (!historicoModal) return;
  renderHistoricoTable();
  historicoModal.classList.remove("hidden");
  if (historicoBtn) historicoBtn.setAttribute("aria-expanded", "true");
  if (historicoCloseBtn) historicoCloseBtn.focus();
}

function closeHistoricoModal(){
  if (!historicoModal) return;
  historicoModal.classList.add("hidden");
  if (historicoBtn) {
    historicoBtn.setAttribute("aria-expanded", "false");
    historicoBtn.focus();
  }
}

function bindHistoricoModal(){
  if (historicoBtn){
    historicoBtn.addEventListener("click", openHistoricoModal);
  }
  if (historicoCloseBtn){
    historicoCloseBtn.addEventListener("click", closeHistoricoModal);
  }
  if (historicoModal){
    historicoModal.addEventListener("click", (e) => {
      if (e.target === historicoModal) closeHistoricoModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && historicoModal && !historicoModal.classList.contains("hidden")){
      closeHistoricoModal();
    }
  });
}

// ====== Comparação entre dois Postos/Graduações ======
// Reaproveita o mesmo motor de cálculo (computeDetalhamento) já usado pelo
// formulário principal: troca temporariamente o valor de #posto, recalcula,
// captura os totais (mensais via window.__ULTIMO_CALC_MENSAL__, anuais via
// lerTotaisAnuaisAtual()) e, ao final, restaura o posto originalmente
// selecionado. Como os dois modais usados aqui cobrem a tela inteira com um
// fundo opaco (mesmo padrão de .subsidios-modal/.ac4-modal), a troca
// temporária de posto durante o cálculo não fica visível ao usuário.
function renderCompararPostoOptions(){
  if (!compararPostoSelect) return;
  const postoAtual = byId("posto") ? byId("posto").value : "";
  const opcoes = Object.keys(SUBSIDIO).filter((p) => p !== postoAtual);
  compararPostoSelect.innerHTML =
    `<option value="" disabled selected>Selecione...</option>` +
    opcoes.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
}

function openCompararModal(){
  const postoSel = byId("posto");
  if (!postoSel || !postoSel.value) {
    if (postoSel) {
      postoSel.focus();
      if (typeof postoSel.reportValidity === "function") postoSel.reportValidity();
    }
    return;
  }
  if (!compararModal) return;
  const label = byId("compararPostoAtualLabel");
  if (label) label.textContent = postoSel.value;
  renderCompararPostoOptions();
  compararModal.classList.remove("hidden");
  if (compararCloseBtn) compararCloseBtn.focus();
}

function closeCompararModal(){
  if (!compararModal) return;
  compararModal.classList.add("hidden");
  if (btnComparar) btnComparar.focus();
}

function openCompararResultadoModal(){
  if (!compararResultadoModal) return;
  compararResultadoModal.classList.remove("hidden");
  if (compararResultadoCloseBtn) compararResultadoCloseBtn.focus();
}

function closeCompararResultadoModal(){
  if (!compararResultadoModal) return;
  compararResultadoModal.classList.add("hidden");
  if (btnComparar) btnComparar.focus();
}

// Aplica um posto ao formulário, recalcula e devolve um retrato (mensal +
// anual) dos totais resultantes. O pequeno atraso antes de ler os totais
// anuais dá tempo à sincronização (RAF/timeout) das colunas de Férias e 13º
// dentro de #tbodyDetalhamentoAnual, no raro caso de ela não terminar de
// forma síncrona dentro do próprio computeDetalhamento().
function snapshotComparacaoParaPosto(postoValor){
  return new Promise((resolve) => {
    const postoSel = byId("posto");
    postoSel.value = postoValor;
    if (typeof recomputePercentFromValor === "function") recomputePercentFromValor();
    if (typeof recomputeIpasgoFromPercent === "function") recomputeIpasgoFromPercent();
    computeDetalhamento();
    setTimeout(() => {
      const mensal = window.__ULTIMO_CALC_MENSAL__ || { posto: postoValor, subsidio: 0, totalBruto: 0, totalDescontos: 0, liquido: 0, feriasLiquido: 0, decimoLiquido: 0, feriasDecimoLiquido: 0 };
      const anual = lerTotaisAnuaisAtual();
      resolve({
        posto: postoValor,
        subsidio: mensal.subsidio,
        mensal: { bruto: mensal.totalBruto, descontos: mensal.totalDescontos, liquido: mensal.liquido },
        feriasDecimo: {
          total: mensal.feriasDecimoLiquido || 0,
          ferias: mensal.feriasLiquido || 0,
          decimo: mensal.decimoLiquido || 0,
        },
        anual,
      });
    }, 120);
  });
}

// Quebra nomes de posto/graduação compostos (ex.: "1º Sargento / Cadete 3º
// ano") em duas linhas — uma para cada lado da " / " — para caber melhor
// nas colunas estreitas da janela de comparação. O bloco resultante fica
// centralizado na coluna, mas o início das duas linhas internas permanece
// alinhado entre si (ver .cmp-nome-quebrado em styles.css).
function quebrarNomePostoLongo(nome){
  const texto = String(nome || "");
  const partes = texto.split(" / ");
  if (partes.length !== 2) return escapeHtml(texto);
  return `<span class="cmp-nome-quebrado">${escapeHtml(partes[0])} /<br>${escapeHtml(partes[1])}</span>`;
}

function renderComparacaoResultado(snapA, snapB){
  const colAM = byId("compararColAMensal"), colBM = byId("compararColBMensal");
  const colAF = byId("compararColAFerias13"), colBF = byId("compararColBFerias13");
  const colAA = byId("compararColAAnual"), colBA = byId("compararColBAnual");
  if (colAM) colAM.innerHTML = quebrarNomePostoLongo(snapA.posto);
  if (colBM) colBM.innerHTML = quebrarNomePostoLongo(snapB.posto);
  if (colAF) colAF.innerHTML = quebrarNomePostoLongo(snapA.posto);
  if (colBF) colBF.innerHTML = quebrarNomePostoLongo(snapB.posto);
  if (colAA) colAA.innerHTML = quebrarNomePostoLongo(snapA.posto);
  if (colBA) colBA.innerHTML = quebrarNomePostoLongo(snapB.posto);
  // A faixa "A vs B" tem largura suficiente para o nome do posto/graduação
  // caber em uma única linha (ao contrário dos cabeçalhos estreitos das
  // tabelas abaixo, que continuam usando quebrarNomePostoLongo).
  const nomeA = byId("compararNomeA"), nomeB = byId("compararNomeB");
  if (nomeA) nomeA.textContent = snapA.posto;
  if (nomeB) nomeB.textContent = snapB.posto;

  // Diferença (B − A): azul quando positiva, laranja quando negativa.
  const linha = (icone, desc, a, b, cls, destaque) => {
    const d = round2(b - a);
    const sinal = d > 0 ? "+" : "";
    const diffCls = d > 0.004 ? "diff-positivo" : (d < -0.004 ? "diff-negativo" : "diff-zero");
    return `
      <div class="cmp-row${destaque ? " cmp-row--destaque" : ""}">
        <span class="cmp-row-label"><svg class="icon" aria-hidden="true"><use href="#${icone}"></use></svg><span>${escapeHtml(desc)}</span></span>
        <span class="cmp-row-values">
          <span class="cmp-row-val cmp-col-a ${cls}">${fmt(a)}</span>
          <span class="cmp-row-val cmp-col-b ${cls}">${fmt(b)}</span>
          <span class="cmp-diff-badge ${diffCls}">${sinal}${fmt(d)}</span>
        </span>
      </div>`;
  };

  const cmpMensal = byId("cmpTabelaMensal");
  if (cmpMensal) {
    cmpMensal.innerHTML =
      linha("i-rank", "Subsídio Efetivo", snapA.subsidio, snapB.subsidio, "azul") +
      linha("i-wallet", "Somatório Remuneração Bruta", snapA.mensal.bruto, snapB.mensal.bruto, "azul") +
      linha("i-trend-down", "Somatório Descontos", snapA.mensal.descontos, snapB.mensal.descontos, "vermelho") +
      linha("i-shield-check", "Remuneração Líquida", snapA.mensal.liquido, snapB.mensal.liquido, "verde", true);
  }
  const cmpFerias13 = byId("cmpTabelaFerias13");
  if (cmpFerias13) {
    cmpFerias13.innerHTML =
      linha("i-gift", "Adicional Férias e 13º", snapA.feriasDecimo.total, snapB.feriasDecimo.total, "verde", true) +
      linha("i-sun", "Adicional Férias (1/3)", snapA.feriasDecimo.ferias, snapB.feriasDecimo.ferias, "verde") +
      linha("i-gift", "13º", snapA.feriasDecimo.decimo, snapB.feriasDecimo.decimo, "verde");
  }
  const cmpAnual = byId("cmpTabelaAnual");
  if (cmpAnual) {
    cmpAnual.innerHTML =
      linha("i-wallet", "Proventos (ano)", snapA.anual.proventos, snapB.anual.proventos, "azul") +
      linha("i-trend-down", "Descontos (ano)", snapA.anual.descontos, snapB.anual.descontos, "vermelho") +
      linha("i-shield-check", "Remuneração Líquida (ano)", snapA.anual.liquido, snapB.anual.liquido, "verde", true) +
      linha("i-bar-chart", "Média Mensal Líquida (ano)", round2(snapA.anual.liquido / 12), round2(snapB.anual.liquido / 12), "amarelo");
  }
}

async function executarComparacao(){
  const postoSel = byId("posto");
  const postoA = postoSel ? postoSel.value : "";
  const postoB = compararPostoSelect ? compararPostoSelect.value : "";
  if (!postoA) return;
  if (!postoB) {
    if (compararPostoSelect) {
      compararPostoSelect.focus();
      if (typeof compararPostoSelect.reportValidity === "function") compararPostoSelect.reportValidity();
    }
    return;
  }
  if (compararExecutarBtn) compararExecutarBtn.disabled = true;
  try {
    const snapA = await snapshotComparacaoParaPosto(postoA);
    const snapB = await snapshotComparacaoParaPosto(postoB);
    // Restaura o posto originalmente selecionado no formulário principal
    postoSel.value = postoA;
    if (typeof recomputePercentFromValor === "function") recomputePercentFromValor();
    if (typeof recomputeIpasgoFromPercent === "function") recomputeIpasgoFromPercent();
    computeDetalhamento();
    closeCompararModal();
    renderComparacaoResultado(snapA, snapB);
    openCompararResultadoModal();
  } finally {
    if (compararExecutarBtn) compararExecutarBtn.disabled = false;
  }
}

function bindCompararModal(){
  if (btnComparar) btnComparar.addEventListener("click", openCompararModal);
  if (compararCloseBtn) compararCloseBtn.addEventListener("click", closeCompararModal);
  if (compararCancelarBtn) compararCancelarBtn.addEventListener("click", closeCompararModal);
  if (compararModal) {
    compararModal.addEventListener("click", (e) => { if (e.target === compararModal) closeCompararModal(); });
  }
  if (compararExecutarBtn) compararExecutarBtn.addEventListener("click", executarComparacao);
  if (compararResultadoCloseBtn) compararResultadoCloseBtn.addEventListener("click", closeCompararResultadoModal);
  if (compararResultadoModal) {
    compararResultadoModal.addEventListener("click", (e) => { if (e.target === compararResultadoModal) closeCompararResultadoModal(); });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (compararResultadoModal && !compararResultadoModal.classList.contains("hidden")) { closeCompararResultadoModal(); return; }
    if (compararModal && !compararModal.classList.contains("hidden")) { closeCompararModal(); }
  });
}

function renderAdicionaisChips(){
  if (!adicionaisChips) return;
  const ordem = ["AC2", "AC3", "AC4", "AC5"];
  const chips = ordem.filter((cod) => adicionaisSelecionados.has(cod));
  adicionaisChips.innerHTML = chips.map((cod) => `
    <div class="adicional-chip" title="${escapeHtml(AC_LABELS[cod] || cod)}">
      <span>${escapeHtml(cod)}</span>
      <button type="button" class="chip-remove" data-remove-adicional="${escapeHtml(cod)}" aria-label="Remover ${escapeHtml(cod)}">x</button>
    </div>
  `).join("");
}

function bindAdicionaisEventos(){
  if (adicionaisSelect){
    adicionaisSelect.addEventListener("change", () => {
      const val = adicionaisSelect.value || "";
      if (!val) return;
      if (val === "AC4"){
        openAc4Modal();
      } else {
        adicionaisSelecionados.add(val);
        renderAdicionaisChips();
        recalcularComIndicadorDeCarregamento();
      }
      adicionaisSelect.value = "";
    });
  }
  if (adicionaisChips){
    adicionaisChips.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-adicional]");
      if (!btn) return;
      const cod = btn.getAttribute("data-remove-adicional");
      if (!cod) return;
      adicionaisSelecionados.delete(cod);
      if (cod === "AC4"){
        ac4Config = buildAc4DefaultConfig();
        ac4DraftConfig = buildAc4DefaultConfig();
      }
      renderAdicionaisChips();
      recalcularComIndicadorDeCarregamento();
    });
  }
  if (ac4Modal){
    // Botão "Adicionar": lê os dias marcados e as horas escolhidas para
    // cada um, cria uma linha de serviço por dia (id sequencial, para
    // permitir remoção individual), depois zera a área de montagem.
    if (ac4AddBtn){
      ac4AddBtn.addEventListener("click", () => {
        const checks = ac4Modal.querySelectorAll(".ac4-day input[type='checkbox']");
        let added = false;
        checks.forEach((el) => {
          if (!el.checked) return;
          const day = el.dataset.day;
          if (!AC4_TOTAL_24H[day]) return;
          const qtyEl = ac4Modal.querySelector(`.ac4-qty[data-day='${day}']`);
          let horas = qtyEl ? Number(qtyEl.value ?? 0) : 0;
          if (!isFinite(horas)) horas = 0;
          horas = Math.max(0, Math.min(24, horas));
          if (horas <= 0) return;
          const inicioEl = ac4Modal.querySelector(`.ac4-inicio[data-day='${day}']`);
          let inicio = inicioEl ? Number(inicioEl.value ?? 0) : 0;
          if (!isFinite(inicio)) inicio = 0;
          inicio = Math.max(0, Math.min(23, inicio));
          ac4EntrySeq += 1;
          ac4DraftConfig.push({ id: ac4EntrySeq, day, inicio, horas });
          added = true;
        });
        if (!added) return;
        checks.forEach((el) => {
          el.checked = false;
          const day = el.dataset.day;
          const qtyEl = ac4Modal.querySelector(`.ac4-qty[data-day='${day}']`);
          if (qtyEl){
            qtyEl.value = "0";
            qtyEl.disabled = true;
          }
          const inicioEl = ac4Modal.querySelector(`.ac4-inicio[data-day='${day}']`);
          if (inicioEl){
            inicioEl.value = "0";
            inicioEl.disabled = true;
          }
        });
        renderAc4Rows();
      });
    }
    if (ac4RowsEl){
      ac4RowsEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-ac4-remove]");
        if (!btn) return;
        const id = Number(btn.getAttribute("data-ac4-remove"));
        ac4DraftConfig = ac4DraftConfig.filter((item) => item.id !== id);
        renderAc4Rows();
      });
    }
    if (ac4ConfirmBtn){
      ac4ConfirmBtn.addEventListener("click", () => {
        ac4Config = cloneAc4Config(ac4DraftConfig);
        if (ac4Config.length) adicionaisSelecionados.add("AC4");
        else adicionaisSelecionados.delete("AC4");
        renderAdicionaisChips();
        closeAc4Modal();
        recalcularComIndicadorDeCarregamento();
      });
    }
    if (ac4CancelBtn){
      ac4CancelBtn.addEventListener("click", () => {
        closeAc4Modal();
      });
    }
    ac4Modal.addEventListener("click", (e) => {
      if (e.target === ac4Modal) closeAc4Modal();
    });
  }
}

bindAdicionaisEventos();
bindSubsidiosModal();
bindHistoricoModal();
bindCompararModal();
renderAdicionaisChips();



// Recalcula o percentual a partir do valor em R$
function recomputePercentFromValor(){
  if (!ipasgoSel || ipasgoSel.value !== "manual") {
    if (ipasgoPercentBadge) ipasgoPercentBadge.textContent = "0,00 %";
    if (ipasgoManualInfo) ipasgoManualInfo.textContent = "Plano de Saúde (Manual - 0,00%), sendo que esse percentual é calculado na hora a partir do valor em R$ e do subsídio do posto/graduação selecionado.";
    return;
  }
  const postoSel = byId("posto");
  const posto = postoSel ? postoSel.value : "";
  const baseSubs = SUBSIDIO[posto] || 0;
  const valEl = byId("valorIpasgo");
  const val = parseMoney(valEl && valEl.value ? valEl.value : "0");
  let perc = 0;
  if (baseSubs > 0) perc = (val / baseSubs) * 100;
  const percTxt = String((Math.round(perc * 100) / 100).toFixed(2)).replace(".", ",") + " %";
  if (ipasgoPercentBadge){ ipasgoPercentBadge.textContent = percTxt; }
  if (ipasgoManualInfo){ ipasgoManualInfo.textContent = "Plano de Saúde (Manual - " + percTxt.replace(" %","%") + "), sendo que esse percentual é calculado na hora a partir do valor em R$ e do subsídio do posto/graduação selecionado."; }
}
// Se mudar o posto/graduação, sincroniza para ambos os sentidos
byId("posto").addEventListener("change", () => { recomputePercentFromValor(); if (typeof recomputeIpasgoFromPercent === "function") recomputeIpasgoFromPercent(); recalcularComIndicadorDeCarregamento(); });
// Máscara simples para inputs monetários
["valorIpasgo", "associacaoValor"].forEach(id => {
  const el = byId(id);
  el.addEventListener("input", (e) => {
    let v = e.target.value.replace(/[^\d,\.]/g, "");
    const parts = v.split(",");
    if (parts.length > 2) v = parts[0] + "," + parts.slice(1).join("");
    e.target.value = v;
  });
});

// ====== Cálculo ======
const form = byId("formRemuneracao");
const resultado = byId("resultado");
const totalBrutoEl = byId("totalBruto");
const totalDescontosEl = byId("totalDescontos");
const resumoBrutoEl = byId("resumoBruto");
const resumoDescontosEl = byId("resumoDescontos");
const resumoLiquidoEl = byId("resumoLiquido");
const totalBrutoHeaderEl = byId("totalBrutoHeader");
const totalDescontosHeaderEl = byId("totalDescontosHeader");
const resumoLiquidoHeaderEl = byId("resumoLiquidoHeader");
const feriasLiquidoHeaderEl = byId("feriasLiquidoHeader");
const decimoLiquidoHeaderEl = byId("decimoLiquidoHeader");
const ferias13TotLiquidoHeaderEl = byId("ferias13TotLiquidoHeader");
const ferias13BoxLiquidoHeaderEl = byId("ferias13BoxLiquidoHeader");
const detalhamentoAnualTotalHeaderEl = byId("detalhamentoAnualTotalHeader");
const valoresAnuaisMediaLiquidaEl = byId("valoresAnuaisMediaLiquida");
const metodoIrpfEl = byId("metodoIrpf");

form.addEventListener("submit", (e) => { e.preventDefault(); recalcularComIndicadorDeCarregamento(); });

function setupDetailCollapses(){
  document.querySelectorAll("[data-collapse-toggle]").forEach((button) => {
    const section = button.closest("[data-collapse-section]");
    if (!section) return;
    const title = button.querySelector(".collapse-title")?.textContent?.trim() || "conteúdo";
    const syncButtonState = () => {
      const isExpanded = button.getAttribute("aria-expanded") === "true";
      section.classList.toggle("is-collapsed", !isExpanded);
      const action = isExpanded ? "Recolher" : "Expandir";
      button.title = `${action} ${title}`;
      button.setAttribute("aria-label", `${action} ${title}`);
    };

    syncButtonState();

    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      syncButtonState();
    });
  });
}

setupDetailCollapses();

// ====== Indicador "Carregando..." ======
// computeDetalhamento() em si é rápido (poucos ms), mas o app também roda,
// por baixo, algumas rotinas defensivas de resincronização (observadas em
// ~150-200ms) que ajustam detalhes da tabela anual após o cálculo direto.
// O indicador fica visível por essa janela real de acomodação — nem menos
// (para não sumir "no meio" de uma atualização) nem mais do que o
// necessário (para não atrasar artificialmente o usuário).
const CARREGANDO_JANELA_MS = 260;
let __carregandoHideTimer = null;
function mostrarCarregando(){
  const el = byId("carregandoBadge");
  if (!el) return;
  if (__carregandoHideTimer) { clearTimeout(__carregandoHideTimer); __carregandoHideTimer = null; }
  el.classList.remove("hidden");
}
function esconderCarregando(){
  const el = byId("carregandoBadge");
  if (!el) return;
  if (__carregandoHideTimer) clearTimeout(__carregandoHideTimer);
  __carregandoHideTimer = setTimeout(() => { el.classList.add("hidden"); }, CARREGANDO_JANELA_MS);
}
// Mostra o aviso, cede um frame para o navegador realmente pintá-lo na tela
// (senão o show+hide síncronos nunca chegariam a aparecer) e só então roda
// o cálculo de verdade. Só mostra o aviso quando já há dados mínimos para
// calcular (mesma condição de computeDetalhamento()) — evita um "Carregando"
// fantasma em ajustes internos de estado inicial, antes de o usuário
// escolher um posto/graduação.
function recalcularComIndicadorDeCarregamento(){
  const postoEl = byId("posto");
  const mesEl = byId("mes");
  if (postoEl && postoEl.value && mesEl && mesEl.value) mostrarCarregando();
  const rodar = () => { computeDetalhamento(); esconderCarregando(); };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(rodar);
  else setTimeout(rodar, 0);
}

function computeDetalhamento() {
  // Campos obrigatórios
  const mes = byId("mes").value;
  const posto = byId("posto").value;
  const dependentes = Number(byId("dependentes").value || 0);

  if (!mes || !posto) {
    // Resultado só fica visível com Posto/Graduação selecionado
    const resEl = byId("resultado");
    if (resEl) resEl.hidden = true;
    return;
  }
  // 1) Proventos
  const baseSubs = SUBSIDIO[posto];
  const subsidio = round2(baseSubs * (1 + (__reajustePercent||0)/100));
  // Teto constitucional: valores de proventos permanecem integrais; apenas a
  // base usada para previdência/IR é limitada, e o excedente vira desconto.
  const { base: subsidioTetoBase, excedente: abateTeto } = aplicarAbateTeto(subsidio);
  const adicionaisCalc = getAdicionaisCalculo();
  const adicionaisTributaveis = adicionaisCalc.totalTributavel;
  const adicionaisIsentos = adicionaisCalc.totalIsento;
  const rendimentoTributavel = round2(subsidioTetoBase + adicionaisTributaveis);
  const proventos = [
    { desc: `Subsídio Efetivo (${posto})` + (__reajustePercent ? ` (+${(__reajustePercent).toFixed(2).replace(".",",")}% )` : ""), valor: subsidio, badge: abateTeto > 0 ? "acima do teto" : undefined },
    { desc: "Abono Fardamento", valor: ABONO_FARDAMENTO }
  ];
  adicionaisCalc.items.forEach((ad) => {
    const sufixo = ad.isento ? " (isento de IRPF e sem descontos)" : "";
    proventos.push({ desc: `${ad.desc}${sufixo}`, valor: round2(ad.valor) });
  });
  const totalBruto = sum(proventos.map(p => p.valor));

  // 2) Descontos fixos + pensão
  const pensao = round2(subsidioTetoBase * ALIQUOTA_PENSAO);
  let ipasgoValor = 0;
let ipasgoSelecionado = false;
  let ipasgoTetoApplied = false;
const ipasgoMode = ipasgoSel ? ipasgoSel.value : "nao";
if (ipasgoMode === "basico") { ipasgoValor = round2(subsidio * 0.0681);
  if (ipasgoValor > IPASGO_TETO_BASICO) { ipasgoValor = IPASGO_TETO_BASICO; ipasgoTetoApplied = true; } ipasgoSelecionado = true; }
else if (ipasgoMode === "especial") { ipasgoValor = round2(subsidio * 0.1248);
  if (ipasgoValor > IPASGO_TETO_ESPECIAL) { ipasgoValor = IPASGO_TETO_ESPECIAL; ipasgoTetoApplied = true; } ipasgoSelecionado = true; }
else if (ipasgoMode === "manual") { ipasgoValor = round2(parseMoney(valorIpasgoInput ? valorIpasgoInput.value : "0")); ipasgoSelecionado = ipasgoValor > 0; }

  const associacaoValor = parseMoney(byId("associacaoValor").value);

  // 3) IRPF automático (IRRF mensal) — período do mês
  const periodo = ["Janeiro","Fevereiro","Março","Abril"].includes(mes) ? "jan_abr" : "mai_dez";
  const P = PARAMS_IRRF[periodo];
  const dedDependentes = round2(P.dependente * dependentes);

  // Deduções legais permitidas no mês (para o simulador): previdência oficial + dependentes
  const deducoesLegais = round2(pensao + dedDependentes);

  // Desconto simplificado mensal: 25% do rendimento, limitado
  const simplificado = Math.min(rendimentoTributavel * 0.25, P.desconto_simplificado_limite);

  // Usa o MAIOR entre deduções legais e desconto simplificado
  const descontoAplicado = Math.max(deducoesLegais, simplificado);
  const metodo = descontoAplicado === simplificado;

  let baseCalc = rendimentoTributavel - descontoAplicado;
  if (baseCalc < 0) baseCalc = 0;

  // Aplica a tabela progressiva mensal
  let aliquota = 0, deducao = 0;
  for (const faixa of P.faixas) {
    if (baseCalc <= faixa.ate) { aliquota = faixa.aliquota; deducao = faixa.deducao; break; }
  }
  let irpf = baseCalc * aliquota - deducao;
  if (irpf < 0) irpf = 0;
  irpf = round2(irpf);

  // 4) Descontos finais
  const descontos = [
    { desc: "Fardamento", valor: FARDAMENTO },
    { desc: "FAS – militar – ativo", valor: FAS },
    { desc: "Contribuição Pensão e Inatividade (10,5%)", valor: pensao },
    { desc: `IRPF`, valor: irpf }
  ];
  if (abateTeto > 0) {
    descontos.push({ desc: "Abate teto constitucional", valor: abateTeto });
  }
if (ipasgoSelecionado) {
  let modeLabel = "";
  if (ipasgoMode === "basico") modeLabel = "Plano Padrão 6,81%";
  else if (ipasgoMode === "especial") modeLabel = "Plano Especial 12,48%";
  if (ipasgoMode === "manual") {
    const perc = (subsidio > 0) ? (Math.round((ipasgoValor / subsidio) * 10000) / 100) : 0;
    const percTxt = String(perc.toFixed(2)).replace(".", ",") + "%";
    const label = "Plano de Saúde (Manual – " + percTxt + ")";
    descontos.push({ desc: label, valor: ipasgoValor });
  } else { const label = "IPASGO (" + modeLabel + ")"; const _item = { desc: label, valor: ipasgoValor }; if (ipasgoTetoApplied) _item.badge = "teto"; descontos.push(_item); }
}

  if (associacaoValor > 0) descontos.push({ desc: "Filiação a Associação", valor: associacaoValor });

  const totalDescontos = sum(descontos.map(d => d.valor));
  const liquido = totalBruto - totalDescontos;

  // Snapshot mensal do posto/graduação recém-calculado, usado pela
  // funcionalidade "Comparar" para ler os totais sem depender do texto
  // formatado no DOM (que pode incluir sufixo de delta de reajuste).
  window.__ULTIMO_CALC_MENSAL__ = { posto, subsidio, totalBruto: round2(totalBruto), totalDescontos: round2(totalDescontos), liquido: round2(liquido) };


  // ====== Deltas por Reajuste (comparativo com base sem reajuste) ======
  let deltaBruto = 0, deltaDesc = 0, deltaLiq = 0;
  // Totais base (sem reajuste) — declarados fora do if para uso seguro no pós-cálculo
  let totalBrutoBase = 0, totalDescontosBase = 0, liquidoBase = 0;
  if ((__reajustePercent||0) > 0){
    // Totais base (sem reajuste) para comparação
    totalBrutoBase = round2(baseSubs + ABONO_FARDAMENTO + adicionaisCalc.total);
    const { base: baseSubsTetoBase, excedente: abateTetoBase } = aplicarAbateTeto(baseSubs);
    const pensaoBase = round2(baseSubsTetoBase * ALIQUOTA_PENSAO);
    const rendimentoTributavelBase = round2(baseSubsTetoBase + adicionaisTributaveis);

    const periodoBase = ["Janeiro","Fevereiro","Março","Abril"].includes(mes) ? "jan_abr" : "mai_dez";
    const Pbase = PARAMS_IRRF[periodoBase];
    const dedDependentesBase = round2(Pbase.dependente * dependentes);
    const deducoesLegaisBase = round2(pensaoBase + dedDependentesBase);
    const simplificadoBase = Math.min(rendimentoTributavelBase * 0.25, Pbase.desconto_simplificado_limite);
    const descontoAplicadoBase = Math.max(deducoesLegaisBase, simplificadoBase);
    let baseCalcBase = rendimentoTributavelBase - descontoAplicadoBase;
    if (baseCalcBase < 0) baseCalcBase = 0;
    let aliquotaBase = 0, deducaoBase = 0;
    for (const faixa of Pbase.faixas) {
      if (baseCalcBase <= faixa.ate) { aliquotaBase = faixa.aliquota; deducaoBase = faixa.deducao; break; }
    }
    let irpfBase = baseCalcBase * aliquotaBase - deducaoBase;
    if (irpfBase < 0) irpfBase = 0;
    irpfBase = round2(irpfBase);

    totalDescontosBase = FARDAMENTO + FAS + pensaoBase + irpfBase + abateTetoBase;
    if (ipasgoSelecionado) totalDescontosBase += ipasgoValor;
    if (associacaoValor > 0) totalDescontosBase += associacaoValor;
    totalDescontosBase = round2(totalDescontosBase);

    liquidoBase = round2(totalBrutoBase - totalDescontosBase);

    deltaBruto = round2(totalBruto - totalBrutoBase);
    deltaDesc  = round2(totalDescontos - totalDescontosBase);
    deltaLiq   = round2(liquido - liquidoBase);
  }

  // Render
  renderRows(tbodyProventos, proventos, "azul");
  renderRows(tbodyDescontos, descontos, "vermelho");

  // Atualiza totais com indicativo de acréscimo (valor e %) quando houver reajuste
  const showDelta = ((__reajustePercent||0) > 0);
  const fmtPerc = (n) => `${(n>=0?'+':'')}${Math.abs(n).toFixed(2).replace('.',',')}%`;
  const deltaPercBruto = showDelta && totalBrutoBase > 0 ? (deltaBruto / totalBrutoBase * 100) : 0;
  const deltaPercDesc  = showDelta && totalDescontosBase > 0 ? (deltaDesc  / totalDescontosBase * 100) : 0;
  const deltaPercLiq   = showDelta && liquidoBase > 0 ? (deltaLiq   / liquidoBase * 100) : 0;

  const brutoHtml = showDelta ? (fmt(totalBruto) + ` <small>(+${fmt(deltaBruto)} | ${fmtPerc(deltaPercBruto)})</small>`) : fmt(totalBruto);
  const descontosHtml = showDelta ? (fmt(totalDescontos) + ` <small>(+${fmt(deltaDesc)} | ${fmtPerc(deltaPercDesc)})</small>`) : fmt(totalDescontos);
  const liquidoHtml = showDelta ? (fmt(liquido) + ` <small>(+${fmt(deltaLiq)} | ${fmtPerc(deltaPercLiq)})</small>`) : fmt(liquido);
  totalBrutoEl.innerHTML = brutoHtml;
  totalDescontosEl.innerHTML = descontosHtml;
  resumoBrutoEl.innerHTML = brutoHtml;
  resumoDescontosEl.innerHTML = descontosHtml;
  resumoLiquidoEl.innerHTML = liquidoHtml;
  if (totalBrutoHeaderEl) totalBrutoHeaderEl.textContent = fmt(totalBruto);
  if (totalDescontosHeaderEl) totalDescontosHeaderEl.textContent = fmt(totalDescontos);
  if (resumoLiquidoHeaderEl) resumoLiquidoHeaderEl.textContent = fmt(liquido);
  if (showDelta) {
    document.body.classList.add("deltas-on");
    setReajusteDeltaAttr("totalBrutoHeader", formatReajusteDelta(deltaBruto, totalBrutoBase));
    setReajusteDeltaAttr("totalDescontosHeader", formatReajusteDelta(deltaDesc, totalDescontosBase));
    setReajusteDeltaAttr("resumoLiquidoHeader", formatReajusteDelta(deltaLiq, liquidoBase));
  } else {
    clearReajusteDeltaAttrs([
      "totalBrutoHeader",
      "totalDescontosHeader",
      "resumoLiquidoHeader",
      "feriasLiquidoHeader",
      "decimoLiquidoHeader",
      "ferias13TotLiquidoHeader",
      "ferias13BoxLiquidoHeader",
    ]);
    document.body.classList.remove("deltas-on");
  }
  metodoIrpfEl.textContent = ``;  // ===== Férias (1/3) e 13º =====
  try {
    const noPrevTerco = true; // toggle removed

    // Terço de férias sobre o subsídio atual
    const terco = round2(subsidio / 3);
    const prevFerias = 0;

    // IR sobre férias (incremental no mês do pagamento)
    // Reaproveita P (tabela mensal) e variáveis já calculadas: pensao, irpf, dependentes, subsidio
    const dedDependentes2 = round2(P.dependente * dependentes);
    const deducoesLegais2 = round2((pensao + prevFerias) + dedDependentes2);
    const simplificado2 = Math.min((subsidioTetoBase + terco) * 0.25, P.desconto_simplificado_limite);
    const descontoAplicado2 = Math.max(deducoesLegais2, simplificado2);

    let baseCalc2 = (subsidioTetoBase + terco) - descontoAplicado2;
    if (baseCalc2 < 0) baseCalc2 = 0;

    let aliquota2 = 0, deducao2 = 0;
    for (const faixa of P.faixas) {
      if (baseCalc2 <= faixa.ate) { aliquota2 = faixa.aliquota; deducao2 = faixa.deducao; break; }
    }
    let irpf2 = baseCalc2 * aliquota2 - deducao2;
    if (irpf2 < 0) irpf2 = 0;
    irpf2 = round2(irpf2);

    const irFerias = round2(Math.max(0, irpf2 - irpf));
    const descFerias = round2(prevFerias + irFerias + abateTeto);
    const liquidoFerias = round2(terco - descFerias);

    // 13º (exclusivo na fonte) — base simplificada: subsídio atual
    const bruto13 = subsidio;
    const prev13 = round2(subsidioTetoBase * ALIQUOTA_PENSAO);
    const dedDependentes13 = round2(PARAMS_IRRF["jan_abr"].dependente * dependentes);
let base13 = subsidioTetoBase - prev13 - dedDependentes13;
    const P13 = PARAMS_IRRF["jan_abr"]; // usa faixas de mai_dez por ser apurado em dezembro
    let aliquota13 = 0, deducao13 = 0;
    for (const faixa of P13.faixas) {
      if (base13 <= faixa.ate) { aliquota13 = faixa.aliquota; deducao13 = faixa.deducao; break; }
    }
    if (base13 < 0) base13 = 0;
    let ir13 = base13 * aliquota13 - deducao13;
    if (ir13 < 0) ir13 = 0;
    ir13 = round2(ir13);

    const desc13 = round2(prev13 + ir13 + abateTeto);
    const liquido13 = round2(bruto13 - desc13);

    // ====== Insumos anuais para o Simulador de Restituição IRPF ======
    // Rendimento tributável do ano = 12 meses do mês corrente (projetado)
    // + o terço de férias + o 13º (mesma lógica de "mês atual repetido"
    // já usada no Detalhamento Anual). IRPF já retido no ano = 12x o IRPF
    // mensal + o incremento de IR pago sobre férias + o IR do 13º.
    try {
      const rendimentoTributavelAnual = round2(rendimentoTributavel * 12 + terco + subsidioTetoBase);
      const irpfRetidoAnual = round2(irpf * 12 + irFerias + ir13);
      const pensaoOficialAnual = round2(pensao * 12 + prev13);
      __irpfAnualDados = {
        rendimentoTributavelAnual,
        irpfRetidoAnual,
        pensaoOficialAnual,
        dependentes,
        ipasgoAnual: round2((ipasgoSelecionado ? ipasgoValor : 0) * 12)
      };
      if (typeof simularRestituicaoIRPF === "function") simularRestituicaoIRPF();
    } catch(_e) { /* silencioso */ }

    // Totais
    const totalBrutoFerias13 = round2(terco + bruto13);
    const totalDescFerias13 = round2(descFerias + desc13);
    const totalLiqFerias13 = round2(liquidoFerias + liquido13);

    // Atualiza DOM (se existir a seção)
    const elCheck = byId("noPrevTerco");
    if (byId("feriasBruto")) {
      byId("feriasBruto").textContent = fmt(terco);
      byId("feriasDesc").textContent = fmt(descFerias);
      byId("feriasDescBreak").textContent = `Prev: ${fmt(prevFerias)} | IR: ${fmt(irFerias)}` + (abateTeto > 0 ? ` | Abate teto: ${fmt(abateTeto)}` : "");
      byId("feriasLiquido").textContent = fmt(liquidoFerias);
      if (feriasLiquidoHeaderEl) feriasLiquidoHeaderEl.textContent = fmt(liquidoFerias);

      byId("decimoBruto").textContent = fmt(bruto13);
      byId("decimoDesc").textContent = fmt(desc13);
      byId("decimoDescBreak").textContent = `Prev: ${fmt(prev13)} | IR: ${fmt(ir13)}` + (abateTeto > 0 ? ` | Abate teto: ${fmt(abateTeto)}` : "");
      byId("decimoLiquido").textContent = fmt(liquido13);
      if (decimoLiquidoHeaderEl) decimoLiquidoHeaderEl.textContent = fmt(liquido13);

      byId("ferias13TotBruto").textContent = fmt(totalBrutoFerias13);
      byId("ferias13TotDesc").textContent = fmt(totalDescFerias13);
      byId("ferias13TotLiquido").textContent = fmt(totalLiqFerias13);
      if (ferias13TotLiquidoHeaderEl) ferias13TotLiquidoHeaderEl.textContent = fmt(totalLiqFerias13);
      if (ferias13BoxLiquidoHeaderEl) ferias13BoxLiquidoHeaderEl.textContent = fmt(totalLiqFerias13);

      // Complementa o snapshot mensal (ver window.__ULTIMO_CALC_MENSAL__ mais
      // acima) com os líquidos de Férias/13º, usados pela comparação entre
      // postos/graduações.
      if (window.__ULTIMO_CALC_MENSAL__) {
        window.__ULTIMO_CALC_MENSAL__.feriasLiquido = liquidoFerias;
        window.__ULTIMO_CALC_MENSAL__.decimoLiquido = liquido13;
        window.__ULTIMO_CALC_MENSAL__.feriasDecimoLiquido = totalLiqFerias13;
      }

    // ===== Deltas do Resumo Adicional Férias e 13º (comparado à base sem reajuste) =====
    (function(){
      try {
        const showDelta = (__reajustePercent||0) > 0;
        if (!showDelta) {
          if (byId("ferias13TotBruto")) byId("ferias13TotBruto").innerHTML = fmt(totalBrutoFerias13);
          if (byId("ferias13TotDesc")) byId("ferias13TotDesc").innerHTML = fmt(totalDescFerias13);
          if (byId("ferias13TotLiquido")) byId("ferias13TotLiquido").innerHTML = fmt(totalLiqFerias13);
          if (byId("ferias13TotBrutoDelta")) byId("ferias13TotBrutoDelta").textContent = "";
          if (byId("ferias13TotDescDelta")) byId("ferias13TotDescDelta").textContent = "";
          if (byId("ferias13TotLiquidoDelta")) byId("ferias13TotLiquidoDelta").textContent = "";
          setReajusteDeltaAttr("feriasLiquidoHeader", "");
          setReajusteDeltaAttr("decimoLiquidoHeader", "");
          setReajusteDeltaAttr("ferias13TotLiquidoHeader", "");
          setReajusteDeltaAttr("ferias13BoxLiquidoHeader", "");
          return;
        }
        // Base SEM reajuste
        const { base: baseSubsTetoBase2, excedente: abateTetoBase2 } = aplicarAbateTeto(baseSubs);
        const tercoBase = round2(baseSubs / 3);
        const prevFeriasBase = 0; // sem previdência sobre o terço no simulador
        // IR férias (base) incremental
        const dedDependentesBase2 = round2(P.dependente * dependentes);
        const deducoesLegaisBase2 = round2((pensao + prevFeriasBase) + dedDependentesBase2);
        const simplificadoBase2 = Math.min((baseSubsTetoBase2 + tercoBase) * 0.25, P.desconto_simplificado_limite);
        const descontoAplicadoBase2 = Math.max(deducoesLegaisBase2, simplificadoBase2);
        let baseCalcBase2 = (baseSubsTetoBase2 + tercoBase) - descontoAplicadoBase2;
        if (baseCalcBase2 < 0) baseCalcBase2 = 0;
        let aliquotaBase2 = 0, deducaoBase2 = 0;
        for (const faixa of P.faixas) {
          if (baseCalcBase2 <= faixa.ate) { aliquotaBase2 = faixa.aliquota; deducaoBase2 = faixa.deducao; break; }
        }
        let irpfBase2 = baseCalcBase2 * aliquotaBase2 - deducaoBase2;
        if (irpfBase2 < 0) irpfBase2 = 0;
        irpfBase2 = round2(irpfBase2);
        // Recalcula IR mensal sem terço para achar somente o incremento do terço (base)
        let baseCalcSemTercoBase = baseSubsTetoBase2 - (Math.max(baseSubsTetoBase2 * 0.25, P.desconto_simplificado_limite, pensao + round2(P.dependente * dependentes)));
        if (baseCalcSemTercoBase < 0) baseCalcSemTercoBase = 0;
        let aliquotaSemTercoBase = 0, deducaoSemTercoBase = 0;
        for (const faixa of P.faixas) {
          if (baseCalcSemTercoBase <= faixa.ate) { aliquotaSemTercoBase = faixa.aliquota; deducaoSemTercoBase = faixa.deducao; break; }
        }
        let irpfSemTercoBase = baseCalcSemTercoBase * aliquotaSemTercoBase - deducaoSemTercoBase;
        if (irpfSemTercoBase < 0) irpfSemTercoBase = 0;
        irpfSemTercoBase = round2(irpfSemTercoBase);
        const irFeriasBase = round2(Math.max(0, irpfBase2 - irpfSemTercoBase));
        const descFeriasBase = round2(prevFeriasBase + irFeriasBase + abateTetoBase2);
        const liquidoFeriasBase = round2(tercoBase - descFeriasBase);

        // 13º base (Janeiro + dependentes)
        const bruto13Base = baseSubs;
        const prev13Base = round2(baseSubsTetoBase2 * ALIQUOTA_PENSAO);
        const P13b = PARAMS_IRRF["jan_abr"];
        const dedDependentes13b = round2(P13b.dependente * dependentes);
        let base13b = baseSubsTetoBase2 - prev13Base - dedDependentes13b;
        if (base13b < 0) base13b = 0;
        let aliquota13b = 0, deducao13b = 0;
        for (const faixa of P13b.faixas) {
          if (base13b <= faixa.ate) { aliquota13b = faixa.aliquota; deducao13b = faixa.deducao; break; }
        }
        let ir13b = base13b * aliquota13b - deducao13b;
        if (ir13b < 0) ir13b = 0;
        ir13b = round2(ir13b);
        const desc13b = round2(prev13Base + ir13b + abateTetoBase2);
        const liq13b = round2(bruto13Base - desc13b);

        const totalBrutoBaseF13 = round2(tercoBase + bruto13Base);
        const totalDescBaseF13 = round2(descFeriasBase + desc13b);
        const totalLiqBaseF13  = round2(liquidoFeriasBase + liq13b);

        // Deltas
        const dBruto = round2(totalBrutoFerias13 - totalBrutoBaseF13);
        const dDesc  = round2(totalDescFerias13  - totalDescBaseF13);
        const dLiq   = round2(totalLiqFerias13   - totalLiqBaseF13);
        const dFeriasLiq = round2(liquidoFerias - liquidoFeriasBase);
        const dDecimoLiq = round2(liquido13 - liq13b);

        const pBruto = totalBrutoBaseF13 ? round2(dBruto / totalBrutoBaseF13 * 100) : 0;
        const pDesc  = totalDescBaseF13  ? round2(dDesc  / totalDescBaseF13  * 100) : 0;
        const pLiq   = totalLiqBaseF13   ? round2(dLiq   / totalLiqBaseF13   * 100) : 0;

        // Render com sufixo " (+R$ X | +Y%)"
        const sufBruto = ` <small class="muted">(+${fmt(Math.abs(dBruto))} | ${fmtPerc(Math.abs(pBruto))})</small>`;
        const sufDesc  = ` <small class="muted">(+${fmt(Math.abs(dDesc))} | ${fmtPerc(Math.abs(pDesc))})</small>`;
        const sufLiq   = ` <small class="muted">(+${fmt(Math.abs(dLiq))} | ${fmtPerc(Math.abs(pLiq))})</small>`;

        if (byId("ferias13TotBruto")) byId("ferias13TotBruto").innerHTML = fmt(totalBrutoFerias13);
        if (byId("ferias13TotBrutoDelta")) byId("ferias13TotBrutoDelta").textContent = `(+${fmt(Math.abs(dBruto))} | ${fmtPerc(Math.abs(pBruto))})`;
        if (byId("ferias13TotDesc")) byId("ferias13TotDesc").innerHTML = fmt(totalDescFerias13);
        if (byId("ferias13TotDescDelta")) byId("ferias13TotDescDelta").textContent = `(+${fmt(Math.abs(dDesc))} | ${fmtPerc(Math.abs(pDesc))})`;
        if (byId("ferias13TotLiquido")) byId("ferias13TotLiquido").innerHTML = fmt(totalLiqFerias13);
        if (byId("ferias13TotLiquidoDelta")) byId("ferias13TotLiquidoDelta").textContent = `(+${fmt(Math.abs(dLiq))} | ${fmtPerc(Math.abs(pLiq))})`;
        setReajusteDeltaAttr("feriasLiquidoHeader", formatReajusteDelta(dFeriasLiq, liquidoFeriasBase));
        setReajusteDeltaAttr("decimoLiquidoHeader", formatReajusteDelta(dDecimoLiq, liq13b));
        setReajusteDeltaAttr("ferias13TotLiquidoHeader", formatReajusteDelta(dLiq, totalLiqBaseF13));
        setReajusteDeltaAttr("ferias13BoxLiquidoHeader", formatReajusteDelta(dLiq, totalLiqBaseF13));
      } catch(e){ /* silencioso */ }
    })();
}
  } catch (e) {
    // ignora se a seção ainda não existe
  }

  
  
  
// === Publish Férias (1/3) & 13º to global state for Detalhamento Anual ===
  try {
    window.__F13__ = {
      ferias:  { bruto: terco,   descontos: descFerias,  liquido: liquidoFerias },
      decimo:  { bruto: bruto13, descontos: desc13,      liquido: liquido13 }
    };
  } catch(_e) { /* no-op */ }
// ===== Detalhamento Anual =====
  try {
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const thead = byId("theadDetalhamentoAnual");
    const tbody = byId("tbodyDetalhamentoAnual");
    if (!thead || !tbody) { /* sem seção */ } else {
      
      // Helper para ler valores monetários do DOM com robustez
      const getNumByIdAnual = (id) => {
        const el = byId(id);
        if (!el) return null;
        const txt = (el.textContent || el.innerText || "").replace(/\u00A0/g,' ').trim();
        if (!txt) return null;
        if (typeof parseMoney === "function") {
          const v = parseMoney(txt);
          if (Number.isFinite(v)) return v;
        }
        const norm = txt.replace(/[^\d,-]/g,"").replace(/\./g,"").replace(",",".");
        const n = Number(norm);
        return Number.isFinite(n) ? n : null;
      };
// Snapshot seguro dos insumos
      const _subsidio = (typeof subsidio !== "undefined" && isFinite(subsidio)) ? subsidio : 0;
      const _ABONO_FARDAMENTO = (typeof ABONO_FARDAMENTO !== "undefined") ? ABONO_FARDAMENTO : 0;
      const _FARDAMENTO = (typeof FARDAMENTO !== "undefined") ? FARDAMENTO : 0;
      const _FAS = (typeof FAS !== "undefined") ? FAS : 0;
      const _ALIQUOTA_PENSAO = (typeof ALIQUOTA_PENSAO !== "undefined") ? ALIQUOTA_PENSAO : 0.105;
      const _dependentes = (typeof dependentes !== "undefined" && isFinite(dependentes)) ? dependentes : (parseInt(byId("dependentes")?.value||"0",10)||0);
      const _ipasgoValor = (typeof ipasgoValor !== "undefined" && isFinite(ipasgoValor)) ? ipasgoValor : (typeof parseMoney === "function" ? parseMoney(byId("valorIpasgo")?.value || "0") : 0);
      const _associacaoValor = (typeof associacaoValor !== "undefined" && isFinite(associacaoValor)) ? associacaoValor : (typeof parseMoney === "function" ? parseMoney(byId("associacaoValor")?.value || "0") : 0);
      const _adicionaisTrib = (typeof adicionaisTributaveis !== "undefined" && isFinite(adicionaisTributaveis)) ? adicionaisTributaveis : 0;
      const _adicionaisIsentos = (typeof adicionaisIsentos !== "undefined" && isFinite(adicionaisIsentos)) ? adicionaisIsentos : 0;
      const _adicionaisTotal = round2(_adicionaisTrib + _adicionaisIsentos);

      // Helpers
      const headCols = meses;
      const renderHead = () => { thead.innerHTML = '<tr><th></th>' + headCols.map(c=>`<th>${c}</th>`).join('') + '</tr>'; };

      const computeMensal = (mi) => {
        const PM = PARAMS_IRRF[ mi <= 3 ? "jan_abr" : "mai_dez" ];
        const rendimentoTribMensal = round2(_subsidio + _adicionaisTrib);
        const bruto = round2(_subsidio + _ABONO_FARDAMENTO + _adicionaisTotal);
        const pensaoM = round2(_subsidio * _ALIQUOTA_PENSAO);
        const dedDepM = round2(PM.dependente * _dependentes);
        const simplifM = Math.min(rendimentoTribMensal * 0.25, PM.desconto_simplificado_limite);
        const dedLegaisM = round2(pensaoM + dedDepM);
        let baseCalcM = rendimentoTribMensal - Math.max(dedLegaisM, simplifM);
        if (baseCalcM < 0) baseCalcM = 0;
        let aM = 0, dM = 0;
        for (const faixa of PM.faixas) { if (baseCalcM <= faixa.ate) { aM = faixa.aliquota; dM = faixa.deducao; break; } }
        let irpfM = round2(baseCalcM * aM - dM); if (irpfM < 0) irpfM = 0;

        const descontos = round2(_FARDAMENTO + _FAS + pensaoM + irpfM + (_ipasgoValor||0) + (_associacaoValor||0));
        const liquido = round2(bruto - descontos);
        return { bruto, descontos, liquido };
      };

      const provs = [], descs = [], liqs = [];
      for (let i=0;i<12;i++){ const r = computeMensal(i); provs.push(r.bruto); descs.push(r.descontos); liqs.push(r.liquido); }

      // Colunas finais (copiadas do card Férias e 13º já computado acima)
      const _terco = (typeof terco !== "undefined") ? terco : 0;
      const _descFerias = (typeof descFerias !== "undefined") ? descFerias : 0;
      const _liqFerias = (typeof liquidoFerias !== "undefined") ? liquidoFerias : Math.max(0, _terco - _descFerias);
      const _bruto13 = (typeof bruto13 !== "undefined") ? bruto13 : _subsidio;
      const _desc13 = (typeof desc13 !== "undefined") ? desc13 : 0;
      const _liq13 = (typeof liquido13 !== "undefined") ? liquido13 : Math.max(0, _bruto13 - _desc13);

      
      // Colunas finais: ler diretamente do DOM da seção "Férias e 13º" (garante sincronismo)
      

      const tercoAnual = getNumByIdAnual("feriasBruto");
      const descFeriasAnual = getNumByIdAnual("feriasDesc");
      const liqFeriasAnual = getNumByIdAnual("feriasLiquido");

      const bruto13Anual = getNumByIdAnual("decimoBruto");
      const desc13Anual = getNumByIdAnual("decimoDesc");
      const liq13Anual = getNumByIdAnual("decimoLiquido");

      
      // Colunas finais: ler DOM (se já renderizado) com fallback para variáveis computadas
      

      let feriasBrutoVal = getNumByIdAnual("feriasBruto");
      let feriasDescVal  = getNumByIdAnual("feriasDesc");
      let feriasLiqVal   = getNumByIdAnual("feriasLiquido");
      if ((!feriasBrutoVal || feriasBrutoVal === 0) && typeof terco !== "undefined") feriasBrutoVal = terco;
      if ((!feriasDescVal  || feriasDescVal  === 0) && typeof descFerias !== "undefined") feriasDescVal = descFerias;
      if ((!feriasLiqVal   || feriasLiqVal   === 0) && typeof liquidoFerias !== "undefined") feriasLiqVal = liquidoFerias;

      let decimoBrutoVal = getNumByIdAnual("decimoBruto");
      let decimoDescVal  = getNumByIdAnual("decimoDesc");
      let decimoLiqVal   = getNumByIdAnual("decimoLiquido");
      if ((!decimoBrutoVal || decimoBrutoVal === 0) && typeof bruto13 !== "undefined") decimoBrutoVal = bruto13;
      if ((!decimoDescVal  || decimoDescVal  === 0) && typeof desc13  !== "undefined") decimoDescVal  = desc13;
      if ((!decimoLiqVal   || decimoLiqVal   === 0) && typeof liquido13 !== "undefined") decimoLiqVal = liquido13;

      provs.push(feriasBrutoVal, decimoBrutoVal);
      descs.push(feriasDescVal,  decimoDescVal);
      liqs.push(feriasLiqVal,    decimoLiqVal);

      
      
      renderHead();
      const row = (label, arr) => {
        const cls = label === 'Proventos' ? 'f13-row-proventos' : (label === 'Descontos' ? 'f13-row-descontos' : 'f13-row-liquido');
        return '<tr class="'+cls+'"><td><strong>'+label+'</strong></td>' + arr.map(v=>`<td class="right">${fmtSemMoeda(v)}</td>`).join('') + '</tr>';
      };
      
      const f13 = (window && window.__F13__) ? window.__F13__ : { ferias:{bruto:0,descontos:0,liquido:0}, decimo:{bruto:0,descontos:0,liquido:0} };
      const provsAll = provs.concat([f13.ferias.bruto, f13.decimo.bruto]);
      const descsAll = descs.concat([f13.ferias.descontos, f13.decimo.descontos]);
      const liqsAll  = liqs .concat([f13.ferias.liquido, f13.decimo.liquido]);
      tbody.innerHTML = row("Proventos", provsAll) + row("Descontos", descsAll) + row("Remuneração Líquida", liqsAll);
;

}
} catch(e){ /* silencioso */ }
  // ===== Detalhamento Anual (12 meses: Jan–Dez) =====
  try {
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const thead = byId("theadDetalhamentoAnual");
    const tbody = byId("tbodyDetalhamentoAnual");
    if (thead && tbody){
      const PM_JA = PARAMS_IRRF["jan_abr"];
      const PM_MD = PARAMS_IRRF["mai_dez"];
      const _subsidio = (typeof subsidio !== "undefined" && isFinite(subsidio)) ? subsidio : 0;
      const _AF = (typeof ABONO_FARDAMENTO !== "undefined") ? ABONO_FARDAMENTO : 0;
      const _FARD = (typeof FARDAMENTO !== "undefined") ? FARDAMENTO : 0;
      const _FAS = (typeof FAS !== "undefined") ? FAS : 0;
      const _ALI = (typeof ALIQUOTA_PENSAO !== "undefined") ? ALIQUOTA_PENSAO : 0.105;
      const _dep = (typeof dependentes !== "undefined" && isFinite(dependentes)) ? dependentes : (parseInt(byId("dependentes")?.value||"0",10)||0);
      const _ipas = (typeof ipasgoValor !== "undefined" && isFinite(ipasgoValor)) ? ipasgoValor : (typeof parseMoney==="function" ? parseMoney(byId("valorIpasgo")?.value||"0") : 0);
      const _assoc = (typeof associacaoValor !== "undefined" && isFinite(associacaoValor)) ? associacaoValor : (typeof parseMoney==="function" ? parseMoney(byId("associacaoValor")?.value||"0") : 0);
      const _adTrib = (typeof adicionaisTributaveis !== "undefined" && isFinite(adicionaisTributaveis)) ? adicionaisTributaveis : 0;
      const _adIsentos = (typeof adicionaisIsentos !== "undefined" && isFinite(adicionaisIsentos)) ? adicionaisIsentos : 0;
      const _adTot = round2(_adTrib + _adIsentos);
      const { base: _subsidioTetoBase, excedente: _abateTeto } = aplicarAbateTeto(_subsidio);
      function calcMensal(mi){
        const PM = mi<=3 ? PM_JA : PM_MD;
        const rendimentoTrib = round2(_subsidioTetoBase + _adTrib);
        const bruto = round2(_subsidio + _AF + _adTot);
        const pens = round2(_subsidioTetoBase * _ALI);
        const dedDep = round2(PM.dependente * _dep);
        const simpl = Math.min(rendimentoTrib * 0.25, PM.desconto_simplificado_limite);
        const dedLeg = round2(pens + dedDep);
        let base = rendimentoTrib - Math.max(dedLeg, simpl);
        if (base < 0) base = 0;
        let a=0,d=0;
        for (const fx of PM.faixas){ if (base <= fx.ate){ a=fx.aliquota; d=fx.deducao; break; } }
        let ir = base*a - d; if (ir < 0) ir = 0; ir = round2(ir);
        const descontos = round2(_FARD + _FAS + pens + ir + (_ipas||0) + (_assoc||0) + _abateTeto);
        const liquido = round2(bruto - descontos);
        return {bruto, descontos, liquido};
      }
      const provs=[], descs=[], liqs=[];
      for (let i=0;i<12;i++){ const r = calcMensal(i); provs.push(r.bruto); descs.push(r.descontos); liqs.push(r.liquido); }
      thead.innerHTML = '<tr><th></th>' + meses.map(m=>`<th>${m}</th>`).join('') + `<th>Férias (1/3)</th><th>13º</th></tr>`;
      const row = (label, arr) => '<tr><td><strong>'+label+'</strong></td>' + arr.map(v=>`<td class="right">${fmtSemMoeda(v)}</td>`).join('') + '</tr>';
      
      // Acrescentar as colunas finais com valores da seção "Férias e 13º"
      const getNumByIdAnual2 = (id) => {
        const el = byId(id);
        if (!el) return null;
        const txt = (el.textContent || el.innerText || "").trim();
        if (!txt) return null;
        if (typeof parseMoney === "function") return parseMoney(txt);
        return Number(txt.replace(/[^\d,-]/g,"").replace(/\./g,"").replace(",",".") || 0);
      };
      let feriasB = getNumByIdAnual2("feriasBruto");
      let feriasD = getNumByIdAnual2("feriasDesc");
      let feriasL = getNumByIdAnual2("feriasLiquido");
      if (feriasB == null && typeof terco !== "undefined") feriasB = terco;
      if (feriasD == null && typeof descFerias !== "undefined") feriasD = descFerias;
      if (feriasL == null && typeof liquidoFerias !== "undefined") feriasL = liquidoFerias;
      let decimoB = getNumByIdAnual2("decimoBruto");
      let decimoD = getNumByIdAnual2("decimoDesc");
      let decimoL = getNumByIdAnual2("decimoLiquido");
      if (decimoB == null && typeof bruto13 !== "undefined") decimoB = bruto13;
      if (decimoD == null && typeof desc13  !== "undefined") decimoD = desc13;
      if (decimoL == null && typeof liquido13 !== "undefined") decimoL = liquido13;
      feriasB = +((feriasB ?? 0)); feriasD = +((feriasD ?? 0)); feriasL = +((feriasL ?? (feriasB - feriasD)));
      decimoB = +((decimoB ?? 0)); decimoD = +((decimoD ?? 0)); decimoL = +((decimoL ?? (decimoB - decimoD)));
      const provsAll = provs.concat([feriasB, decimoB]);
      const descsAll = descs.concat([feriasD, decimoD]);
      const liqsAll  = liqs.concat([feriasL, decimoL]);
      tbody.innerHTML = row("Proventos", provsAll) + row("Descontos", descsAll) + row("Remuneração Líquida", liqsAll);
    }
  } catch(e){ /* silencioso */ }
  resultado.hidden = false;
  const badge = byId('autoBadge');
if (badge){
    badge.classList.remove('hidden');
    badge.classList.add('show');
    clearTimeout(window.__autoBadgeTimer);
    window.__autoBadgeTimer = setTimeout(()=>{ badge.classList.remove('show'); }, 1200);
  }

  // ---- END-SYNC: atualiza as duas colunas extras do Detalhamento Anual com TEXTO dos cards ----
  try {
    const thead = byId("theadDetalhamentoAnual");
    const tbody = byId("tbodyDetalhamentoAnual");
    if (thead && tbody) {
      const ensureHeadExtras = () => {
        const tr = thead.querySelector("tr");
        if (!tr) return;
        const cols = tr.children.length;
        if (cols < 15) {
          tr.insertAdjacentHTML("beforeend",
            '<th>Férias (1/3)</th><th>13º</th>');
        }
      };
      const getTxt = (id) => {
        const el = byId(id);
        if (!el) return null;
        const t = (el.textContent || el.innerText || "").replace(/\u00A0/g," ").trim();
        return t || null;
      };
      const setLastTwo = (row, t1, t2) => {
        if (!row) return;
        const headCols = thead.querySelector("tr")?.children?.length || 15;
        while (row.cells.length < headCols) {
          const td = document.createElement("td");
          td.className = "right";
          row.appendChild(td);
        }
        const c1 = row.cells[row.cells.length - 2];
        const c2 = row.cells[row.cells.length - 1];
        const fmtCell = (txt) => {
          if (txt == null) return "—";
          const clean = String(txt).replace(/\u00A0/g, " ").trim();
          if (!/\d/.test(clean)) return clean || "—";
          const n = typeof parseMoney === "function" ? parseMoney(clean) : Number(clean);
          return Number.isFinite(n) ? fmtSemMoeda(n) : String(txt).replace(/\bR\$\s*/g, "").trim();
        };
        c1.textContent = fmtCell(t1);
        c2.textContent = fmtCell(t2);
        c1.classList.add("right");
        c2.classList.add("right");
      };
      const syncOnce = () => {
        const rows = tbody.querySelectorAll("tr");
        if (rows.length < 3) return false;
        const fB = getTxt("feriasBruto");
        const fD = getTxt("feriasDesc");
        const fL = getTxt("feriasLiquido");
        const dB = getTxt("decimoBruto");
        const dD = getTxt("decimoDesc");
        const dL = getTxt("decimoLiquido");
        if ([fB,fD,fL,dB,dD,dL].some(v => v == null)) return false;
        ensureHeadExtras();
        setLastTwo(rows[0], fB, dB); // Proventos
        setLastTwo(rows[1], fD, dD); // Descontos
        setLastTwo(rows[2], fL, dL);
        // Força cores por classe e inline (backup)
        try {
          rows[0].classList.add("f13-row-proventos");
          rows[1].classList.add("f13-row-descontos");
          rows[2].classList.add("f13-row-liquido");
          const col0 = "#1e40af", col1 = "#b91c1c", col2 = "#15803d";
          [...rows[0].cells].forEach((td,i)=>{ if(i>0) td.style.color = col0; });
          [...rows[1].cells].forEach((td,i)=>{ if(i>0) td.style.color = col1; });
          [...rows[2].cells].forEach((td,i)=>{ if(i>0) td.style.color = col2; });
        } catch(_e) { /* silencioso */ }
     // Líquido
        // Atualiza os totais novamente (garantia)
      try {
        const rows = byId("tbodyDetalhamentoAnual")?.querySelectorAll("tr") || [];
        if (rows.length>=3){
          ensureHeadExtras();
          // reusa setTotalMonthsOnly se presente
          if (typeof setTotalMonthsOnly === "function") {
            setTotalMonthsOnly(rows[0]);
            setTotalMonthsOnly(rows[1]);
            setTotalMonthsOnly(rows[2]);
          }
        }
      } catch(_e) {}
return true;
      };
      // tentar já, depois no próximo frame e com pequenos atrasos
      if (!syncOnce()) {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => { syncOnce() || setTimeout(syncOnce, 50); });
        } else {
          setTimeout(syncOnce, 50);
        }
        // Observa alterações nos cards e na própria tabela para re-sincronizar
        try {
          const targets = [byId("ferias13Box"), byId("tabelaDetalhamentoAnual")].filter(Boolean);
          if (targets.length && typeof MutationObserver !== "undefined") {
            const obs = new MutationObserver(() => { syncOnce(); });
            targets.forEach(t => obs.observe(t, { childList:true, subtree:true, characterData:true }));
            const stopIfDone = () => { if (syncOnce()) obs.disconnect(); };
            setTimeout(stopIfDone, 200);
            setTimeout(stopIfDone, 600);
          }
        } catch(_e) { /* silencioso */ }
      }
    }
  } catch(_e) { /* silencioso */ }
}

// Botão limpar (mantido apenas como hook opcional; o botão foi removido da tela)
byId("limpar")?.addEventListener("click", () => {
  form.reset();
  valorIpasgoInput.value = "";
  byId("associacaoValor").value = "";
  // AC5 só entra no padrão se a data de referência atual já o suportar
  // (disponível a partir de jul/2026).
  const [nomeMesReset, anoResetStr] = String(byId("mesAno")?.value || "").split("|");
  const mesResetIdx = MESES_NOMES.indexOf(nomeMesReset);
  const ac5DisponivelReset = mesResetIdx >= 0 && anoResetStr &&
    chaveAnoMes(Number(anoResetStr), mesResetIdx + 1) >= chaveAnoMes(AC5_DISPONIVEL_DESDE.ano, AC5_DISPONIVEL_DESDE.mes);
  adicionaisSelecionados = new Set(ac5DisponivelReset ? ["AC5"] : []);
  ac4Config = buildAc4DefaultConfig();
  ac4DraftConfig = buildAc4DefaultConfig();
  if (adicionaisSelect) adicionaisSelect.value = "";
  renderAdicionaisChips();
  closeAc4Modal();
  grupoIpasgoValor.classList.add("hidden");
  if (reajusteWrap) reajusteWrap.classList.add("hidden");
  
  __reajustePercent = 0;
  resultado.hidden = true;
  tbodyProventos.innerHTML = "";
  tbodyDescontos.innerHTML = "";
  if (totalBrutoHeaderEl) totalBrutoHeaderEl.textContent = "R$ 0,00";
  if (totalDescontosHeaderEl) totalDescontosHeaderEl.textContent = "R$ 0,00";
  if (resumoLiquidoHeaderEl) resumoLiquidoHeaderEl.textContent = "R$ 0,00";
  if (feriasLiquidoHeaderEl) feriasLiquidoHeaderEl.textContent = "R$ 0,00";
  if (decimoLiquidoHeaderEl) decimoLiquidoHeaderEl.textContent = "R$ 0,00";
  if (ferias13TotLiquidoHeaderEl) ferias13TotLiquidoHeaderEl.textContent = "R$ 0,00";
  if (ferias13BoxLiquidoHeaderEl) ferias13BoxLiquidoHeaderEl.textContent = "R$ 0,00";
  if (detalhamentoAnualTotalHeaderEl) detalhamentoAnualTotalHeaderEl.textContent = "R$ 0,00";
  if (valoresAnuaisMediaLiquidaEl) valoresAnuaisMediaLiquidaEl.textContent = "R$ 0,00";
  clearReajusteDeltaAttrs([
    "totalBrutoHeader",
    "totalDescontosHeader",
    "resumoLiquidoHeader",
    "feriasLiquidoHeader",
    "decimoLiquidoHeader",
    "ferias13TotLiquidoHeader",
    "ferias13BoxLiquidoHeader",
    "valoresAnuaisProventos",
    "valoresAnuaisDescontos",
    "valoresAnuaisLiquido",
    "valoresAnuaisMediaLiquida",
  ]);
  document.body.classList.remove("deltas-on");
  metodoIrpfEl.textContent = "";
  ["irpfOutrasDespesasMedicas", "irpfDespesasEducacao", "irpfPensaoAlimenticia", "irpfPGBL"].forEach((id) => {
    const el = byId(id);
    if (!el) return;
    el.value = "";
    el.disabled = false;
  });
  const metodoDeducaoEl = byId("irpfMetodoDeducao");
  if (metodoDeducaoEl) metodoDeducaoEl.value = "legais";
});

// Helpers
function sum(arr){ return arr.reduce((a,b)=> a + (Number(b)||0), 0); }
function round2(n){ return Math.round(n * 100) / 100; }

// Lê os totais anuais (Proventos, Descontos, Remuneração Líquida) a partir
// das linhas já renderizadas em #tbodyDetalhamentoAnual — mesma lógica de
// soma usada pela caixa "LEVANTAMENTO ANUAL" — para reaproveitar na
// funcionalidade "Comparar" sem duplicar as fórmulas de cálculo anual.
function lerTotaisAnuaisAtual(){
  const tbody = byId("tbodyDetalhamentoAnual");
  const vazio = { proventos: 0, descontos: 0, liquido: 0 };
  if (!tbody) return vazio;
  const rows = tbody.querySelectorAll("tr");
  if (!rows || rows.length < 3) return vazio;
  const sumRow = (row) => {
    let total = 0;
    for (let i = 1; i < row.cells.length; i++) {
      const txt = (row.cells[i].textContent || "").replace(/ /g, " ").trim();
      if (!txt || txt === "—" || txt === "-") continue;
      const v = parseMoney(txt);
      if (Number.isFinite(v)) total += v;
    }
    return round2(total);
  };
  return {
    proventos: sumRow(rows[0]),
    descontos: sumRow(rows[1]),
    liquido: sumRow(rows[2]),
  };
}

function renderRows(tbody, items, colorClass){
  tbody.innerHTML = items.map(it => `
    <tr>
      <td class="cell-left">
        <span>${escapeHtml(it.desc)}</span>
        ${it.badge ? `<span class="badge badge-teto">${escapeHtml(it.badge)}</span>` : ``}
      </td>
      <td class="right ${colorClass}"><strong>${fmt(it.valor)}</strong></td>
    </tr>
  `).join("");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Ano no rodapé
document.getElementById("ano").textContent = new Date().getFullYear();


// === Sincronização IPASGO (duas vias) ===
function recomputeIpasgoFromPercent(){
  if (!ipasgoSel || ipasgoSel.value !== "manual") return;
  if (!ipasgoPercentInput) return;
  const posto = byId("posto").value; if (!posto) return;
  const subsidio = SUBSIDIO[posto] || 0;
  const perc = parseMoney(String(ipasgoPercentInput.value).replace("%",""));
  const valor = Math.round(subsidio * (perc/100) * 100) / 100;
  if (isFinite(valor) && valorIpasgoInput){ valorIpasgoInput.value = String(valor.toFixed(2)).replace(".", ","); }
}
function recomputePercentFromValor(){
  if (!ipasgoSel || ipasgoSel.value !== "manual") {
    if (ipasgoPercentBadge) ipasgoPercentBadge.textContent = "0,00 %";
    if (ipasgoManualInfo) ipasgoManualInfo.textContent = "Plano de Saúde (Manual - 0,00%), sendo que esse percentual é calculado na hora a partir do valor em R$ e do subsídio do posto/graduação selecionado.";
    return;
  }
  const postoSel = byId("posto");
  const posto = postoSel ? postoSel.value : "";
  const baseSubs = SUBSIDIO[posto] || 0;
  const valEl = byId("valorIpasgo");
  const val = parseMoney(valEl && valEl.value ? valEl.value : "0");
  let perc = 0;
  if (baseSubs > 0) perc = (val / baseSubs) * 100;
  if (ipasgoPercentBadge){ ipasgoPercentBadge.textContent = String((Math.round(perc * 100) / 100).toFixed(2)).replace(".", ",") + " %"; }
}
// Listeners
if (ipasgoPercentInput){
  ipasgoPercentInput.addEventListener("input", () => {
    let v = ipasgoPercentInput.value.replace(/[^\d,\.]/g, "");
    const parts = v.split(",");
    if (parts.length > 2) v = parts[0] + "," + parts.slice(1).join("");
    ipasgoPercentInput.value = v;
    recomputeIpasgoFromPercent();
  });
}
// ====== Reajuste: UI e sincronização ======

// ====== Reajuste: validação/máscara e botões rápidos ======

// ====== Reajuste: slider/barra ======
const reajusteRange = document.getElementById("reajusteRange");
const reajusteRangeVal = document.getElementById("reajusteRangeVal");

function updateReajusteRangeUI(val){
  if (reajusteRange) reajusteRange.value = String(val);
  if (reajusteRangeVal) reajusteRangeVal.textContent = formatPercentTwoDecimals(val) + "%";
}

// ====== Reajuste: reset ao ocultar ======
function resetReajuste(){
  __reajustePercent = 0;
  const range = document.getElementById("reajusteRange");
  if (range){ range.value = "0"; }
  if (typeof updateReajusteRangeUI === "function"){ updateReajusteRangeUI(0); }
  clearReajusteDeltaAttrs([
    "totalBrutoHeader",
    "totalDescontosHeader",
    "resumoLiquidoHeader",
    "feriasLiquidoHeader",
    "decimoLiquidoHeader",
    "ferias13TotLiquidoHeader",
    "ferias13BoxLiquidoHeader",
  ]);
  document.body.classList.remove("deltas-on");
  computeDetalhamento && computeDetalhamento();
}


if (reajusteRange){
  reajusteRange.addEventListener("input", () => {
    let v = Number(reajusteRange.value || 0);
    v = clampPercent(v);
    __reajustePercent = v;
    // sincroniza campo de texto e badge

    updateReajusteRangeUI(v);
    computeDetalhamento();
  });
}


// Permitir digitação direta no valor ao lado da barra (reajusteRangeVal)
if (reajusteRangeVal){
  const applyRangeValPercent = (commit) => {
    try {
      let rawTxt = (reajusteRangeVal.textContent || reajusteRangeVal.innerText || "").replace("%", "").trim();
      // Sanitiza para manter no máximo 2 casas decimais e apenas dígitos + vírgula
      if (typeof sanitizePercentInput === "function"){
        const masked = sanitizePercentInput(rawTxt);
        if (masked !== rawTxt){
          rawTxt = masked;
          reajusteRangeVal.textContent = masked;
        }
      }
      let perc = 0;
      if (typeof normalizePercentToNumber === "function"){
        perc = normalizePercentToNumber(rawTxt);
      } else if (typeof parseMoney === "function"){
        perc = parseMoney(rawTxt);
      } else {
        perc = Number(String(rawTxt).replace(",", ".") || 0);
      }
      if (typeof clampPercent === "function"){
        perc = clampPercent(perc);
      }
      __reajustePercent = perc;
      if (reajusteRange) reajusteRange.value = String(perc);
      if (commit && typeof updateReajusteRangeUI === "function"){
        // No commit, normaliza visualmente para XX,XX% usando a função padrão
        updateReajusteRangeUI(perc);
      }
      if (typeof computeDetalhamento === "function"){
        // Qualquer mudança válida de percentual já recalcula imediatamente o detalhamento
        computeDetalhamento();
      }
    } catch(_e){
      // silencioso
    }
  };

  // Ao focar/clicar para editar, limpa o conteúdo para evitar mistura com o símbolo de porcentagem
  const clearOnFocus = () => {
    try {
      const rawTxt = (reajusteRangeVal.textContent || reajusteRangeVal.innerText || "").trim();
      // Só limpa se ainda estiver com "%"
      if (rawTxt.endsWith("%")){
        reajusteRangeVal.textContent = "";
      }
    } catch(_e){}
  };
  reajusteRangeVal.addEventListener("focus", clearOnFocus);
  reajusteRangeVal.addEventListener("click", clearOnFocus);

  // Enquanto digita, aplica o percentual em tempo real (sem forçar o % para não atrapalhar a digitação)
  reajusteRangeVal.addEventListener("input", () => applyRangeValPercent(false));

  // Ao sair do campo, normaliza o valor (2 casas, vírgula, sufixo %) e sincroniza tudo.
  reajusteRangeVal.addEventListener("blur", () => applyRangeValPercent(true));

  // Se o usuário pressionar Enter, também comita imediatamente o valor e aplica o reajuste
  reajusteRangeVal.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      applyRangeValPercent(true);
      // Remove o foco para disparar o mesmo fluxo visual do blur
      reajusteRangeVal.blur();
    }
  });
}


// Quando o usuário digitar no campo de texto, sincroniza a barra também
if (reajustePercentInput){
  reajustePercentInput.addEventListener("input", () => {
    updateReajusteRangeUI(__reajustePercent);
  });
  reajustePercentInput.addEventListener("blur", () => {
    updateReajusteRangeUI(__reajustePercent);
  });
}

// Reset da barra ao limpar (hook opcional; o botão foi removido da tela)
byId("limpar")?.addEventListener("click", () => {
  updateReajusteRangeUI(0);
});


// ====== Reajuste: seletor de valor exato (3, 5, 10) ======
const reajusteSelect = document.getElementById("reajusteSelect");
if (reajusteSelect && reajustePercentInput){
  reajusteSelect.addEventListener("change", () => {
    const v = Number(reajusteSelect.value || 0);
    if (!v){ return; } // "Escolher…"
    __reajustePercent = v;
    // Atualiza o campo com formatação 2 casas e recalcula
    reajustePercentInput.value = String(v.toFixed(2)).replace(".", ",");
    reajustePercentInput.classList.remove("invalid");
    computeDetalhamento();
  });
}

const reajusteQuick = document.getElementById("reajusteQuickBtns");

function sanitizePercentInput(str){
  // Mantém apenas dígitos e vírgula, uma vírgula no máximo, e no máx 2 casas decimais
  if (!str) return "";
  let s = String(str).replace(/[^\d,]/g, "");
  const parts = s.split(",");
  if (parts.length > 2){
    s = parts[0] + "," + parts.slice(1).join("");
  }
  if (s.includes(",")){
    const [intp, decp=""] = s.split(",");
    s = intp.replace(/^0+(\d)/, "$1") + "," + decp.slice(0,2);
  } else {
    // sem vírgula por enquanto; deixamos formatar no blur
    s = s.replace(/^0+(\d)/, "$1");
  }
  return s;
}

function normalizePercentToNumber(str){
  // Converte "12,34" -> 12.34; "12" -> 12
  if (!str) return 0;
  return parseMoney(str); // parseMoney já trata vírgula
}

function formatPercentTwoDecimals(n){
  const val = Math.round(Number(n||0) * 100) / 100;
  return String(val.toFixed(2)).replace(".", ",");
}

function clampPercent(n){
  if (n > MAX_REAJUSTE_PERCENT) return MAX_REAJUSTE_PERCENT;
  if (n < MIN_REAJUSTE_PERCENT) return MIN_REAJUSTE_PERCENT;
  return n;
}

if (reajustePercentInput){
  // Máscara em tempo real (somente números e vírgula; no máx 2 decimais)
  reajustePercentInput.addEventListener("input", (e) => {
    const cur = e.target.value;
    const masked = sanitizePercentInput(cur);
    if (masked !== cur) e.target.value = masked;

    // Atualiza variável e calcula
    let perc = normalizePercentToNumber(masked);
    perc = clampPercent(perc);
    __reajustePercent = perc;

    // Marcação de inválido se ultrapassar limites (antes de clamp visualmente)
    if (normalizePercentToNumber(masked) > MAX_REAJUSTE_PERCENT){
      e.target.classList.add("invalid");
    } else {
      e.target.classList.remove("invalid");
    }

    computeDetalhamento();
  });

  // Ao sair do campo, padroniza para 2 casas e adiciona ,00 se necessário
  reajustePercentInput.addEventListener("blur", (e) => {
    let perc = normalizePercentToNumber(e.target.value);
    perc = clampPercent(perc);
    __reajustePercent = perc;
    e.target.value = formatPercentTwoDecimals(perc);
  });
}

// Botões rápidos: incrementam o valor atual (+3, +5, +10)
if (reajusteQuick){
  reajusteQuick.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-inc]");
    if (!btn || !reajustePercentInput) return;
    const inc = Number(btn.getAttribute("data-inc") || 0);
    let cur = normalizePercentToNumber(reajustePercentInput.value);
    let next = clampPercent(cur + inc);
    __reajustePercent = next;
    reajustePercentInput.value = formatPercentTwoDecimals(next);
    reajustePercentInput.classList.remove("invalid");
    computeDetalhamento();
  });
}

if (btnReajuste){
  btnReajuste.addEventListener("click", () => {
    if (reajusteWrap){ 
      reajusteWrap.classList.toggle("hidden");
      if (reajusteWrap.classList.contains("hidden")){ resetReajuste(); }
      if (!reajusteWrap.classList.contains("hidden") && reajustePercentInput){
        reajustePercentInput.focus();
        reajustePercentInput.select && reajustePercentInput.select();
      }
    }
  });
}
if (reajustePercentInput){
  reajustePercentInput.addEventListener("input", (e) => {
    let v = e.target.value.replace(/[^\d,\.]/g, "");
    const parts = v.split(",");
    if (parts.length > 2) v = parts[0] + "," + parts.slice(1).join("");
    e.target.value = v;
    __reajustePercent = parseMoney(e.target.value);
    if (__reajustePercent < 0) __reajustePercent = 0; if (__reajustePercent > 30) __reajustePercent = 30;
    computeDetalhamento();
  });
}
const noPrevTercoEl = byId("noPrevTerco");
if (noPrevTercoEl) noPrevTercoEl.addEventListener("change", () => { computeDetalhamento(); });
// ====== Auto-recalcular quando campos mudarem ======
// "posto" e "ipasgo" já têm listener dedicado (com efeitos colaterais
// próprios, como sincronizar o % do IPASGO manual); mantê-los aqui também
// disparava computeDetalhamento() em duplicidade a cada interação.
const camposRecalcChange = ["mes","dependentes"];
camposRecalcChange.forEach(id => {
  const el = byId(id);
  if (el) el.addEventListener("change", () => { recalcularComIndicadorDeCarregamento(); });
});
// "valorIpasgo" já tem listener dedicado logo abaixo.
const camposRecalcInput = ["ipasgoPercent","associacaoValor"];
camposRecalcInput.forEach(id => {
  const el = byId(id);
  if (el) el.addEventListener("input", () => { recalcularComIndicadorDeCarregamento(); });
});

// force ipasgo default
(function(){ const s = byId("ipasgo"); if (s) { s.value = "nao"; const ev = new Event("change"); s.dispatchEvent(ev);} })();

byId("valorIpasgo").addEventListener("input", () => { recomputePercentFromValor(); recalcularComIndicadorDeCarregamento(); });







// === FÉRIAS E 13º (Resumo): deltas corretos e só após aplicar reajuste ===
(function(){
  if (window.__FERIAS13_DELTAS_FIX__) return; window.__FERIAS13_DELTAS_FIX__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_e){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }
  function ensureDeltaEl(valueId, deltaId, cls){
    var valueEl = byId(valueId);
    if (!valueEl) return null;
    var el = byId(deltaId);
    if (el) return el;
    var span = document.createElement("div");
    span.id = deltaId;
    span.className = "delta-right " + cls;
    span.textContent = "";
    valueEl.insertAdjacentElement("afterend", span); // abaixo e à direita (td/right)
    return span;
  }

  function readTotals(){
    // Preferir os totais já prontos se existirem
    var bruto   = byId("ferias13TotBruto");
    var desc    = byId("ferias13TotDesc");
    var liquido = byId("ferias13TotLiquido");
    var v = {
      bruto:   bruto ? parseBRL(bruto.textContent||bruto.innerText||"") : 0,
      desc:    desc ? parseBRL(desc.textContent||desc.innerText||"") : 0,
      liquido: liquido ? parseBRL(liquido.textContent||liquido.innerText||"") : 0
    };
    // Se algum total não existir, somar a partir dos componentes (fallback)
    if (!bruto){
      v.bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!desc){
      v.desc = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liquido){
      v.liquido = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return v;
  }

  function captureBase(force){
    if (!force && window.__FERIAS13_BASE) return window.__FERIAS13_BASE;
    var b = readTotals();
    window.__FERIAS13_BASE = b;
    return b;
  }

  function showDeltas(){
    var range = byId("reajusteRange");
    var pct = range ? parseFloat(range.value||"0") : 0;
    var applied = !!window.__REAJUSTE_APLICADO__ && Math.abs(pct) > 1e-9;

    var elB = ensureDeltaEl("ferias13TotBruto",   "ferias13TotBrutoDelta",   "delta-blue");
    var elD = ensureDeltaEl("ferias13TotDesc",    "ferias13TotDescDelta",    "delta-red");
    var elL = ensureDeltaEl("ferias13TotLiquido", "ferias13TotLiquidoDelta", "delta-green");
    if (!elB || !elD || !elL) return;

    if (!applied){ elB.textContent = elD.textContent = elL.textContent = ""; return; }

    // Garante que os totais foram reescritos antes de ler
    setTimeout(function(){
      var base = captureBase(false);
      var now  = readTotals();
      var dB = now.bruto   - base.bruto;
      var dD = now.desc    - base.desc;
      var dL = now.liquido - base.liquido;

      elB.textContent = Math.abs(dB) < 0.005 ? "" : formatDelta(dB, base.bruto);
      elD.textContent = Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc);
      elL.textContent = Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liquido);
    }, 40);
  }

  function bind(){
    // Captura base após os totais existirem
    setTimeout(function(){ captureBase(true); }, 200);

    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        var pct = range ? parseFloat(range.value||"0") : 0;
        window.__REAJUSTE_APLICADO__ = Math.abs(pct) > 1e-9;
        showDeltas();
      });
    }
    if (range){
      ["change"].forEach(function(evt){
        range.addEventListener(evt, function(){
          if (Math.abs(parseFloat(range.value||"0")) < 1e-9){
            window.__REAJUSTE_APLICADO__ = false;
          }
          showDeltas();
        });
      });
    }
    // atualizações ocasionais
    document.addEventListener("input", showDeltas, true);
    document.addEventListener("click", showDeltas, true);
    setTimeout(showDeltas, 400);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();



// === FÉRIAS & 13º: DELTAS INLINE (apenas após aplicar; via data-delta + ::after) ===
(function(){
  if (window.__FERIAS13_DELTAS_INLINE__) return; window.__FERIAS13_DELTAS_INLINE__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",",".");
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_e){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function setDeltaAttr(id, text){
    var el = byId(id);
    if (!el) return;
    if (text && text.trim()) el.setAttribute("data-delta", text);
    else el.removeAttribute("data-delta");
  }
  function readTotals(){
    var brutoEl   = byId("ferias13TotBruto");
    var descEl    = byId("ferias13TotDesc");
    var liquiEl   = byId("ferias13TotLiquido");
    var bruto = brutoEl ? parseBRL(brutoEl.textContent||brutoEl.innerText||"") : 0;
    var desc  = descEl  ? parseBRL(descEl.textContent||descEl.innerText||"")   : 0;
    var liqui = liquiEl ? parseBRL(liquiEl.textContent||liquiEl.innerText||""): 0;

    // Fallback caso não existam os totais agregados
    if (!brutoEl){
      bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!descEl){
      desc  = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liquiEl){
      liqui = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return { bruto: bruto, desc: desc, liquido: liqui };
  }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }
  function clearInline(){
    setDeltaAttr("ferias13TotBruto", "");
    setDeltaAttr("ferias13TotDesc", "");
    setDeltaAttr("ferias13TotLiquido", "");
  }

  function recalcFerias13DeltasInline(){
    var range = byId("reajusteRange");
    var pct = range ? parseFloat(range.value || "0") : 0;
    var applied = !!window.__REAJUSTE_APLICADO__ && Math.abs(pct) > 1e-9;
    if (!applied){ clearInline(); return; }

    // garanta que os totais foram atualizados antes de ler
    try {
      if (typeof recalcFerias13Totais === "function") recalcFerias13Totais();
    } catch(_e){}
    setTimeout(function(){
      var base = window.__FERIAS13_BASE_INLINE__;
      if (!base){
        // se base ainda não capturada, captura agora e não mostra delta nesta passada
        window.__FERIAS13_BASE_INLINE__ = readTotals();
        clearInline();
        return;
      }
      var now = readTotals();
      var dB = now.bruto - base.bruto;
      var dD = now.desc - base.desc;
      var dL = now.liquido - base.liquido;

      setDeltaAttr("ferias13TotBruto",   Math.abs(dB) < 0.005 ? "" : formatDelta(dB, base.bruto));
      setDeltaAttr("ferias13TotDesc",    Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc));
      setDeltaAttr("ferias13TotLiquido", Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liquido));
    }, 40);
  }
  window.recalcFerias13DeltasInline = recalcFerias13DeltasInline;

  function bind(){
    // captura base após a primeira composição dos totais
    setTimeout(function(){ window.__FERIAS13_BASE_INLINE__ = readTotals(); }, 300);

    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        var pct = range ? parseFloat(range.value||"0") : 0;
        window.__REAJUSTE_APLICADO__ = Math.abs(pct) > 1e-9;
        recalcFerias13DeltasInline();
        setTimeout(recalcFerias13DeltasInline, 120);
      });
    }
    if (range){
      ["change"].forEach(function(evt){
        range.addEventListener(evt, function(){
          if (Math.abs(parseFloat(range.value||"0")) < 1e-9){
            window.__REAJUSTE_APLICADO__ = false;
          }
          recalcFerias13DeltasInline();
        });
      });
    }

    // Tentativas iniciais
    setTimeout(recalcFerias13DeltasInline, 500);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();



// === FÉRIAS & 13º: DELTAS INLINE robustos com MutationObserver ===
(function(){
  if (window.__FERIAS13_DELTAS_OBS__) return; window.__FERIAS13_DELTAS_OBS__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_e){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function setDeltaAttr(id, text){
    var el = byId(id);
    if (!el) return;
    if (text && text.trim()) el.setAttribute("data-delta", text);
    else el.removeAttribute("data-delta");
  }
  function readTotals(){
    var brutoEl   = byId("ferias13TotBruto");
    var descEl    = byId("ferias13TotDesc");
    var liquiEl   = byId("ferias13TotLiquido");
    var bruto = brutoEl ? parseBRL(brutoEl.textContent||brutoEl.innerText||"") : 0;
    var desc  = descEl  ? parseBRL(descEl.textContent||descEl.innerText||"")   : 0;
    var liqui = liquiEl ? parseBRL(liquiEl.textContent||liquiEl.innerText||""): 0;

    if (!brutoEl){
      bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!descEl){
      desc  = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liquiEl){
      liqui = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return { bruto: bruto, desc: desc, liquido: liqui };
  }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }

  function ensureBase(forceIfZero){
    var base = window.__FERIAS13_BASE_INLINE__ || {bruto:0,desc:0,liquido:0};
    if (!window.__FERIAS13_BASE_INLINE__ || (forceIfZero && (base.bruto===0 && base.desc===0 && base.liquido===0))){
      // tenta capturar com um pequeno atraso para garantir preenchimento
      base = readTotals();
      // só fixa base se houver números plausíveis (evita capturar tudo 0)
      if ((base.bruto+base.desc+base.liquido) > 0.01){
        window.__FERIAS13_BASE_INLINE__ = base;
      }
    }
    return window.__FERIAS13_BASE_INLINE__ || base;
  }

  function recompute(){
    var range = byId("reajusteRange");
    var pct = range ? parseFloat(range.value||"0") : 0;
    var applied = !!window.__REAJUSTE_APLICADO__ && Math.abs(pct) > 1e-9;
    if (!applied){
      setDeltaAttr("ferias13TotBruto","");
      setDeltaAttr("ferias13TotDesc","");
      setDeltaAttr("ferias13TotLiquido","");
      return;
    }
    var base = ensureBase(false);
    var now  = readTotals();
    if (!base || !now) return;

    var dB = now.bruto   - base.bruto;
    var dD = now.desc    - base.desc;
    var dL = now.liquido - base.liquido;

    setDeltaAttr("ferias13TotBruto",   Math.abs(dB) < 0.005 ? "" : formatDelta(dB, base.bruto));
    setDeltaAttr("ferias13TotDesc",    Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc));
    setDeltaAttr("ferias13TotLiquido", Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liquido));
  }

  // MutationObserver para re-aplicar os deltas sempre que os textos forem reescritos
  function observeTargets(){
    var targets = ["ferias13TotBruto","ferias13TotDesc","ferias13TotLiquido"]
      .map(function(id){ return byId(id); })
      .filter(Boolean);
    if (!targets.length) return;
    var obs = new MutationObserver(function(_){ recompute(); });
    targets.forEach(function(el){
      obs.observe(el, {characterData:true, subtree:true, childList:true});
    });
    // guarda pra possível uso futuro
    window.__FERIAS13_OBS = obs;
  }

  function bind(){
    // Atraso breve para garantir que os totais iniciais existam e capturar base não-zero
    setTimeout(function(){ ensureBase(true); recompute(); observeTargets(); }, 400);

    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        var pct = range ? parseFloat(range.value||"0") : 0;
        window.__REAJUSTE_APLICADO__ = Math.abs(pct) > 1e-9;
        setTimeout(recompute, 20);
        setTimeout(recompute, 150);
      });
    }
    if (range){
      ["change","input"].forEach(function(evt){
        range.addEventListener(evt, function(){
          if (Math.abs(parseFloat(range.value||"0")) < 1e-9){
            window.__REAJUSTE_APLICADO__ = false;
          }
          setTimeout(recompute, 20);
        });
      });
    }
    document.addEventListener("click", function(){ setTimeout(recompute, 20); }, true);
    document.addEventListener("input", function(){ setTimeout(recompute, 20); }, true);

    // Expor para debug manual
    window.debugFerias13Deltas = function(){
      var base = window.__FERIAS13_BASE_INLINE__;
      var now = readTotals();
      console.log("Férias&13º DELTAS DEBUG =>", {base:base, now:now});
      recompute();
      return {
        bruto: document.getElementById("ferias13TotBruto")?.getAttribute("data-delta"),
        desc:  document.getElementById("ferias13TotDesc")?.getAttribute("data-delta"),
        liq:   document.getElementById("ferias13TotLiquido")?.getAttribute("data-delta"),
      };
    };
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();



// === FÉRIAS & 13º: Base capture fix (v146) ===
(function(){
  if (window.__FERIAS13_BASEFIX__) return; window.__FERIAS13_BASEFIX__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function readTotals(){
    var brutoEl = byId("ferias13TotBruto");
    var descEl  = byId("ferias13TotDesc");
    var liqEl   = byId("ferias13TotLiquido");
    var bruto = brutoEl ? parseBRL(brutoEl.textContent||brutoEl.innerText||"") : 0;
    var desc  = descEl  ? parseBRL(descEl.textContent||descEl.innerText||"")   : 0;
    var liq   = liqEl   ? parseBRL(liqEl.textContent||liqEl.innerText||"")     : 0;
    if (!brutoEl){
      bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!descEl){
      desc  = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liqEl){
      liq   = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return {bruto:bruto, desc:desc, liquido:liq};
  }
  function sum(v){ return (v?.bruto||0)+(v?.desc||0)+(v?.liquido||0); }

  // Polling até base != 0 (para páginas que demoram a renderizar)
  function waitBaseNonZero(timeoutMs){
    var started = Date.now();
    function tryOnce(){
      var v = readTotals();
      if (sum(v) > 0.01){
        window.__FERIAS13_BASE_INLINE__ = v;
        return true;
      }
      if (Date.now() - started > timeoutMs) return false;
      setTimeout(tryOnce, 150);
      return null;
    }
    return tryOnce();
  }

  // Observer no container para capturar base assim que números surgirem
  function observeForBase(){
    var host = byId("ferias13Box") || document.body;
    try{
      var mo = new MutationObserver(function(_){
        if (!window.__FERIAS13_BASE_INLINE__ || sum(window.__FERIAS13_BASE_INLINE__) <= 0.01){
          var ok = waitBaseNonZero(0); // tentativa imediata
          if (ok) { mo.disconnect(); }
        }
      });
      mo.observe(host, {childList:true, subtree:true, characterData:true});
      window.__FERIAS13_BASE_OBS = mo;
    }catch(_e){}
  }

  function bindBaseFix(){
    // 1) Poll por até 5s
    var done = waitBaseNonZero(5000);
    if (!done){ observeForBase(); }

    // 2) No clique de aplicar, se base ainda 0, captura antes da alteração
    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        var pct = range ? parseFloat(range.value||"0") : 0;
        // Se base não existe ou é 0, snapshot antes da atualização
        if (!window.__FERIAS13_BASE_INLINE__ || sum(window.__FERIAS13_BASE_INLINE__) <= 0.01){
          window.__FERIAS13_BASE_INLINE__ = readTotals();
        }
        // marca aplicado
        window.__REAJUSTE_APLICADO__ = Math.abs(pct) > 1e-9;
        // deixa o restante do pipeline recalcular os deltas
        try{
          if (typeof recalcFerias13DeltasInline === "function"){ setTimeout(recalcFerias13DeltasInline, 120); }
          if (typeof debugFerias13Deltas === "function"){ setTimeout(debugFerias13Deltas, 200); }
        }catch(_e){}
      });
    }

    // Se slider voltar a 0 e aplicar, mantemos a base (para futuras simulações)
    if (range){
      range.addEventListener("change", function(){
        if (Math.abs(parseFloat(range.value||"0")) < 1e-9){
          window.__REAJUSTE_APLICADO__ = false;
          // não apagamos a base; deltas serão limpos pela lógica existente
        }
      });
    }
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bindBaseFix);
  } else {
    bindBaseFix();
  }
})();



// === v147: Férias&13º deltas sem depender do flag aplicado; usa diferença real ===
(function(){
  if (window.__FERIAS13_DIF_MONITOR__) return; window.__FERIAS13_DIF_MONITOR__ = true;
  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try{ return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function setDeltaAttr(id, text){
    var el = byId(id); if (!el) return;
    if (text && text.trim()) el.setAttribute("data-delta", text);
    else el.removeAttribute("data-delta");
  }
  function readTotals(){
    var brutoEl = byId("ferias13TotBruto");
    var descEl  = byId("ferias13TotDesc");
    var liqEl   = byId("ferias13TotLiquido");
    var bruto = brutoEl ? parseBRL(brutoEl.textContent||brutoEl.innerText||"") : 0;
    var desc  = descEl  ? parseBRL(descEl.textContent||descEl.innerText||"")   : 0;
    var liq   = liqEl   ? parseBRL(liqEl.textContent||liqEl.innerText||"")     : 0;
    if (!brutoEl){
      bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!descEl){
      desc  = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liqEl){
      liq   = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return {bruto:bruto, desc:desc, liquido:liq};
  }
  function sum(v){ return (v?.bruto||0)+(v?.desc||0)+(v?.liquido||0); }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }

  function ensureBase(){
    var base = window.__FERIAS13_BASE_INLINE__;
    if (!base || sum(base) <= 0.01){
      base = readTotals();
      if (sum(base) > 0.01){
        window.__FERIAS13_BASE_INLINE__ = base;
      }
    }
    return window.__FERIAS13_BASE_INLINE__ || {bruto:0,desc:0,liquido:0};
  }

  function recomputeByDiff(){
    var base = ensureBase();
    var now  = readTotals();
    var dB = now.bruto   - base.bruto;
    var dD = now.desc    - base.desc;
    var dL = now.liquido - base.liquido;
    setDeltaAttr("ferias13TotBruto",   Math.abs(dB) < 0.005 ? "" : formatDelta(dB, base.bruto));
    setDeltaAttr("ferias13TotDesc",    Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc));
    setDeltaAttr("ferias13TotLiquido", Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liquido));
  }

  // Observe o container inteiro da seção
  function observeFerias13(){
    var root = byId("ferias13Box") || document.body;
    try{
      var mo = new MutationObserver(function(){ setTimeout(recomputeByDiff, 10); });
      mo.observe(root, {childList:true, subtree:true, characterData:true});
      window.__FERIAS13_DIFF_OBS = mo;
    }catch(_){}
  }

  function bind(){
    // Snapshot inicial da base quando números aparecerem
    setTimeout(function(){ ensureBase(); recomputeByDiff(); }, 400);
    observeFerias13();

    var btn = document.getElementById("simularReajuste");
    var range = document.getElementById("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        setTimeout(recomputeByDiff, 60);
        setTimeout(recomputeByDiff, 180);
      });
    }
    if (range){
      ["input","change"].forEach(function(evt){
        range.addEventListener(evt, function(){ setTimeout(recomputeByDiff, 60); });
      });
    }
    // Expor debug
    window.debugFerias13DeltasV147 = function(){
      var base = window.__FERIAS13_BASE_INLINE__;
      var now = readTotals();
      recomputeByDiff();
      return {
        base, now,
        attrs: {
          bruto: document.getElementById("ferias13TotBruto")?.getAttribute("data-delta"),
          desc:  document.getElementById("ferias13TotDesc")?.getAttribute("data-delta"),
          liq:   document.getElementById("ferias13TotLiquido")?.getAttribute("data-delta")
        }
      };
    };
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();



// v149 — RESUMO ANUAL: deltas abaixo/direita via data-delta (apenas após aplicar)
(function(){
  if (window.__RESUMO_ANUAL_DATADELTA__) return; window.__RESUMO_ANUAL_DATADELTA__ = true;
  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s=(txt||"").replace(/\u00A0/g," ");
    var m=s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if(!m) return 0;
    var raw=m[0].replace(/\./g,"").replace(",","."); var n=Number(raw);
    return isFinite(n)?n:0;
  }
  function fmtBRL(n){
    try{return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}catch(_){return "R$ "+(Math.round(n*100)/100).toFixed(2).replace(".",",");}
  }
  function setDeltaAttr(id, text){
    var el=byId(id); if(!el) return;
    if(text && text.trim()) el.setAttribute("data-delta", text); else el.removeAttribute("data-delta");
  }
  function formatDelta(delta, base){
    if(!isFinite(delta)) return "";
    if(!isFinite(base)||Math.abs(base)<1e-9){
      var sign=delta>=0?"+":"−"; return "("+sign+fmtBRL(Math.abs(delta))+" | —)";
    }
    var pct=(delta/base)*100, signAmt=delta>=0?"+":"−";
    var pctStr=(pct>=0?"+":"−")+Math.abs(pct).toFixed(2).replace(".",",")+"%";
    return "("+signAmt+fmtBRL(Math.abs(delta))+" | "+pctStr+")";
  }
  function readResumo(){
    var P=byId("resumoAnualProventos"), D=byId("resumoAnualDescontos"), L=byId("resumoAnualLiquido");
    if(!P||!D||!L) return null;
    return { prov:parseBRL(P.textContent||P.innerText||""), desc:parseBRL(D.textContent||D.innerText||""), liq:parseBRL(L.textContent||L.innerText||"") };
  }
  function captureBase(){
    if(window.__RESUMO_ANUAL_BASE_DATA) return window.__RESUMO_ANUAL_BASE_DATA;
    var v=readResumo(); if(!v) return null;
    if((v.prov+v.desc+v.liq)>0.01){ window.__RESUMO_ANUAL_BASE_DATA=v; return v; }
    return null;
  }
  function showResumoDeltas(){
    var range=byId("reajusteRange");
    var pct=range?parseFloat(range.value||"0"):0;
    var applied=!!window.__REAJUSTE_APLICADO__ && Math.abs(pct)>1e-9;
    // esconder se não aplicado
    if(!applied){ setDeltaAttr("resumoAnualProventos",""); setDeltaAttr("resumoAnualDescontos",""); setDeltaAttr("resumoAnualLiquido",""); return; }
    // garantir base
    var base=captureBase(); if(!base){ setTimeout(showResumoDeltas,150); return; }
    // ler atuais
    try{
      if (typeof recalcValoresAnuaisFinal === "function") recalcValoresAnuaisFinal();
      else if (typeof recalcValoresAnuaisSimples === "function") recalcValoresAnuaisSimples();
      else if (typeof recalcValoresAnuaisSumRows === "function") recalcValoresAnuaisSumRows();
      else if (typeof recalcValoresAnuais === "function") recalcValoresAnuais();
    }catch(_){}
    var now=readResumo(); if(!now) return;
    var dP=now.prov-base.prov, dD=now.desc-base.desc, dL=now.liq-base.liq;
    setDeltaAttr("resumoAnualProventos",  Math.abs(dP)<0.005?"":formatDelta(dP,base.prov));
    setDeltaAttr("resumoAnualDescontos", Math.abs(dD)<0.005?"":formatDelta(dD,base.desc));
    setDeltaAttr("resumoAnualLiquido",   Math.abs(dL)<0.005?"":formatDelta(dL,base.liq));
  }
  function bind(){
    setTimeout(captureBase,400);
    var btn=byId("simularReajuste"), range=byId("reajusteRange");
    if(btn){ btn.addEventListener("click", function(){ window.__REAJUSTE_APLICADO__ = Math.abs(parseFloat(range?.value||"0"))>1e-9; setTimeout(showResumoDeltas,60); setTimeout(showResumoDeltas,180); }); }
    if(range){ ["change","input"].forEach(function(e){ range.addEventListener(e,function(){ if(Math.abs(parseFloat(range.value||"0"))<1e-9){ window.__REAJUSTE_APLICADO__=false; } setTimeout(showResumoDeltas,60); }); }); }
    // observer para reaplicar após re-render
    var root=byId("resumoAnualBox")||document.body;
    try{ var mo=new MutationObserver(function(){ setTimeout(showResumoDeltas,10); }); mo.observe(root,{childList:true,subtree:true,characterData:true}); window.__RESUMO_ANUAL_OBS=mo; }catch(_){}
  }
  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded", bind); } else { bind(); }
})();










/* ===== v208-lite — Performance + Delta Rebase (sem F5, sem piscadas) ===== */
(function(){
  if (window.__V208_LITE__) return; window.__V208_LITE__ = true;

  const $  = (id)=>document.getElementById(id);
  const q  = (sel,root=document)=>root.querySelector(sel);
  const qa = (sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const norm = (s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();

  const parseBR = (txt)=>{
    if (txt == null) return 0;
    let s = String(txt).replace(/\u00A0/g,' ')
                       .replace(/[^0-9.,\-]/g,'')
                       .replace(/\./g,'')
                       .replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const fmtBR = (n)=>{
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_){ n = Math.round((+n||0)*100)/100; return 'R$ '+n.toFixed(2).replace('.',','); }
  };

  window.__reajuste_aplicado = !!window.__reajuste_aplicado;
  let REAPPLY_GUARD = false;
  let DEBOUNCE_RAF = 0, DEBOUNCE_TMO = 0, DEBOUNCE_DIRTY = false, WRITING = false;

  const setDeltasOn = (on)=> document.body.classList.toggle('deltas-on', !!on);

  function getReajustePercent(){
    const el = document.getElementById('reajusteRange');
    const v = el ? parseFloat(el.value) : 0;
    return Number.isFinite(v) ? v : 0;
  }

  function getResumoAnualTotals(){
    try {
      const tabela = document.getElementById("tabelaDetalhamentoAnual");
      if (!tabela) return null;

      const tbody =
        (tabela.tBodies && tabela.tBodies.length ? tabela.tBodies[0] : null) ||
        tabela.querySelector("tbody") ||
        tabela;

      if (!tbody) return null;

      const rows = tbody.querySelectorAll("tr");
      if (!rows || rows.length < 3) return null;

      const parseCellValue = (cell) => {
        if (!cell) return 0;
        let txt = (cell.textContent || cell.innerText || "").replace(/\u00A0/g, " ").trim();
        if (!txt || txt === "—" || txt === "-") return 0;

        if (typeof parseMoney === "function") {
          const v = parseMoney(txt);
          if (Number.isFinite(v)) return v;
        }

        const norm = txt.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".");
        const n = Number(norm);
        return Number.isFinite(n) ? n : 0;
      };

      const sumRow = (row) => {
        let total = 0;
        for (let i = 1; i < row.cells.length; i++) {
          total += parseCellValue(row.cells[i]);
        }
        return total;
      };

      const proventos = sumRow(rows[0]);
      const descontos = sumRow(rows[1]);
      const liquido   = sumRow(rows[2]);

      return { proventos, descontos, liquido };
    } catch (e) {
      return null;
    }
  }

  function setAnnualDeltaAttr(id, text){
    const el = document.getElementById(id);
    if (!el) return;
    if (text && text.trim()) el.setAttribute("data-delta", text);
    else el.removeAttribute("data-delta");
  }

  function formatAnnualDelta(delta, base){
    return formatReajusteDelta(delta, base);
  }

  function getIpasgoAnnualValue(subsidio){
    const sel = document.getElementById("ipasgo");
    const mode = sel ? sel.value : "nao";
    if (mode === "basico") return Math.min(round2(subsidio * 0.0681), IPASGO_TETO_BASICO);
    if (mode === "especial") return Math.min(round2(subsidio * 0.1248), IPASGO_TETO_ESPECIAL);
    if (mode === "manual") return round2(parseMoney(document.getElementById("valorIpasgo")?.value || "0"));
    return 0;
  }

  function computeResumoAnualForPercent(percent){
    const posto = document.getElementById("posto")?.value;
    if (!posto || !SUBSIDIO[posto]) return null;

    const dependentes = Number(document.getElementById("dependentes")?.value || 0);
    const baseSubs = SUBSIDIO[posto];
    const subsidio = round2(baseSubs * (1 + (Number(percent || 0) / 100)));
    const { base: subsidioTetoBase, excedente: abateTeto } = aplicarAbateTeto(subsidio);
    const adicionaisCalc = typeof getAdicionaisCalculo === "function"
      ? getAdicionaisCalculo()
      : { totalTributavel: 0, totalIsento: 0, total: 0 };
    const adicionaisTrib = round2(adicionaisCalc.totalTributavel || 0);
    const adicionaisTotal = round2(adicionaisCalc.total || 0);
    const ipasgoValor = getIpasgoAnnualValue(subsidio);
    const associacaoValor = parseMoney(document.getElementById("associacaoValor")?.value || "0");

    const calcMensal = (monthIndex) => {
      const P = PARAMS_IRRF[monthIndex <= 3 ? "jan_abr" : "mai_dez"];
      const rendimentoTributavel = round2(subsidioTetoBase + adicionaisTrib);
      const bruto = round2(subsidio + ABONO_FARDAMENTO + adicionaisTotal);
      const pensao = round2(subsidioTetoBase * ALIQUOTA_PENSAO);
      const dedDependentes = round2(P.dependente * dependentes);
      const simplificado = Math.min(rendimentoTributavel * 0.25, P.desconto_simplificado_limite);
      let baseCalc = rendimentoTributavel - Math.max(round2(pensao + dedDependentes), simplificado);
      if (baseCalc < 0) baseCalc = 0;
      let aliquota = 0, deducao = 0;
      for (const faixa of P.faixas) {
        if (baseCalc <= faixa.ate) { aliquota = faixa.aliquota; deducao = faixa.deducao; break; }
      }
      let irpf = round2(baseCalc * aliquota - deducao);
      if (irpf < 0) irpf = 0;
      const descontos = round2(FARDAMENTO + FAS + pensao + irpf + ipasgoValor + associacaoValor + abateTeto);
      return { bruto, descontos, liquido: round2(bruto - descontos), pensao, irpf };
    };

    let proventos = 0, descontos = 0, liquido = 0;
    for (let i = 0; i < 12; i++) {
      const m = calcMensal(i);
      proventos += m.bruto;
      descontos += m.descontos;
      liquido += m.liquido;
    }

    const mes = document.getElementById("mes")?.value || "";
    const periodo = ["Janeiro","Fevereiro","Março","Abril"].includes(mes) ? "jan_abr" : "mai_dez";
    const P = PARAMS_IRRF[periodo];
    const mensalSelecionado = calcMensal(periodo === "jan_abr" ? 0 : 4);
    const terco = round2(subsidio / 3);
    const dedDependentesFerias = round2(P.dependente * dependentes);
    const simplificadoFerias = Math.min((subsidioTetoBase + terco) * 0.25, P.desconto_simplificado_limite);
    let baseFerias = (subsidioTetoBase + terco) - Math.max(round2(mensalSelecionado.pensao + dedDependentesFerias), simplificadoFerias);
    if (baseFerias < 0) baseFerias = 0;
    let aliqFerias = 0, dedFerias = 0;
    for (const faixa of P.faixas) {
      if (baseFerias <= faixa.ate) { aliqFerias = faixa.aliquota; dedFerias = faixa.deducao; break; }
    }
    let irFeriasTotal = round2(baseFerias * aliqFerias - dedFerias);
    if (irFeriasTotal < 0) irFeriasTotal = 0;
    const descFerias = round2(Math.max(0, irFeriasTotal - mensalSelecionado.irpf) + abateTeto);
    const liqFerias = round2(terco - descFerias);

    const bruto13 = subsidio;
    const prev13 = round2(subsidioTetoBase * ALIQUOTA_PENSAO);
    const P13 = PARAMS_IRRF["jan_abr"];
    let base13 = subsidioTetoBase - prev13 - round2(P13.dependente * dependentes);
    if (base13 < 0) base13 = 0;
    let aliq13 = 0, ded13 = 0;
    for (const faixa of P13.faixas) {
      if (base13 <= faixa.ate) { aliq13 = faixa.aliquota; ded13 = faixa.deducao; break; }
    }
    let ir13 = round2(base13 * aliq13 - ded13);
    if (ir13 < 0) ir13 = 0;
    const desc13 = round2(prev13 + ir13 + abateTeto);
    const liq13 = round2(bruto13 - desc13);

    proventos = round2(proventos + terco + bruto13);
    descontos = round2(descontos + descFerias + desc13);
    liquido = round2(liquido + liqFerias + liq13);
    return { proventos, descontos, liquido };
  }

  function writeAnualTotalsFromTable(){
    const totals = getResumoAnualTotals();
    if (!totals) return;

    const vp = document.getElementById("valoresAnuaisProventos");
    const vd = document.getElementById("valoresAnuaisDescontos");
    const vl = document.getElementById("valoresAnuaisLiquido");
    const vm = document.getElementById("valoresAnuaisMediaLiquida");
    const da = document.getElementById("detalhamentoAnualTotalHeader");
    const pct = Number(typeof __reajustePercent !== "undefined" ? __reajustePercent : getReajustePercent()) || 0;

    if (vp) vp.textContent = fmt(totals.proventos);
    if (vd) vd.textContent = fmt(totals.descontos);
    if (vl) vl.textContent = fmt(totals.liquido);
    if (vm) vm.textContent = fmt(totals.liquido / 12);
    if (da) da.textContent = fmt(totals.liquido);

    const ids = ["valoresAnuaisProventos", "valoresAnuaisDescontos", "valoresAnuaisLiquido", "valoresAnuaisMediaLiquida"];
    if (pct <= 0) {
      ids.forEach((id) => setAnnualDeltaAttr(id, ""));
      document.body.classList.remove("deltas-on");
      return;
    }

    const base = computeResumoAnualForPercent(0);
    if (!base) return;
    setAnnualDeltaAttr("valoresAnuaisProventos", formatAnnualDelta(round2(totals.proventos - base.proventos), base.proventos));
    setAnnualDeltaAttr("valoresAnuaisDescontos", formatAnnualDelta(round2(totals.descontos - base.descontos), base.descontos));
    setAnnualDeltaAttr("valoresAnuaisLiquido", formatAnnualDelta(round2(totals.liquido - base.liquido), base.liquido));
    setAnnualDeltaAttr("valoresAnuaisMediaLiquida", formatAnnualDelta(round2((totals.liquido / 12) - (base.liquido / 12)), base.liquido / 12));
    document.body.classList.add("deltas-on");
  }

  function snapshotResumoAnual(){
    const totals = getResumoAnualTotals();
    return totals
      ? {
          proventos: totals.proventos,
          descontos: totals.descontos,
          liquido: totals.liquido,
        }
      : null;
  }

  function scheduleRecompute(){
    DEBOUNCE_DIRTY = true;
    if (DEBOUNCE_RAF) return;
    DEBOUNCE_RAF = requestAnimationFrame(()=>{
      DEBOUNCE_TMO = setTimeout(()=>{
        DEBOUNCE_RAF = 0; DEBOUNCE_TMO = 0;
        if (!DEBOUNCE_DIRTY || WRITING) return;
        WRITING = true;
        try {
          if (typeof window.recalcEverythingNoReload === 'function') window.recalcEverythingNoReload();
          if (typeof window.computeDetalhamento === 'function') window.computeDetalhamento();
          if (typeof window.computeFerias13 === 'function') window.computeFerias13();
          if (typeof window.fillDetalhamentoAnual === 'function') window.fillDetalhamentoAnual();
          if (typeof window.recalcValoresAnuaisFinal === 'function') window.recalcValoresAnuaisFinal();
          if (typeof window.recalcValoresAnuaisRobusto === 'function') window.recalcValoresAnuaisRobusto();

          writeAnualTotalsFromTable();
        } finally {
          WRITING = false;
          DEBOUNCE_DIRTY = false;
        }
      }, 40);
    });
  }


  // Observador para atualizar VALORES ANUAIS sempre que o Detalhamento Anual mudar
  (function(){
    try {
      const tabela = document.getElementById("tabelaDetalhamentoAnual");
      if (!tabela || typeof MutationObserver === "undefined") return;
      const tbody = (tabela.tBodies && tabela.tBodies.length ? tabela.tBodies[0] : null) ||
                    tabela.querySelector("tbody") || tabela;
      if (!tbody) return;
      const obs = new MutationObserver(function(){
        try { writeAnualTotalsFromTable(); } catch(_e) {}
      });
      obs.observe(tbody, { childList: true, subtree: true, characterData: true });
      // Atualiza uma vez na carga, se já houver dados
      writeAnualTotalsFromTable();
    } catch(_e) {}
  })();

  function isIpasgoManual(){
    const sel = document.getElementById('ipasgo'); if (!sel) return false;
    const v = (sel.value||'').toLowerCase();
    const t = (sel.options[sel.selectedIndex]?.text||'').toLowerCase();
    return v.includes('manual') || t.includes('manual');
  }

  function rebaseDeltasAfterPostoChange(){
    if (!window.__reajuste_aplicado) { scheduleRecompute(); return; }
    if (REAPPLY_GUARD) return;
    REAPPLY_GUARD = true;

    scheduleRecompute(); // pinta novo posto
    const pct = getReajustePercent();
    setTimeout(()=>{
      window.__deltaBaseAnual = snapshotResumoAnual(); // nova base
      setDeltasOn(true); // mantém deltas visíveis, sem piscar

      if (typeof window.applyReajustePercent === 'function'){
        try { window.applyReajustePercent(pct); } catch(e){}
      } else {
        scheduleRecompute(); // fallback
      }
      setTimeout(()=>{ REAPPLY_GUARD = false; }, 80);
    }, 80);
  }

  function attachInputs(){
    const ids = ['mes','posto','dependentes','associacaoValor','ipasgo'];
    ids.forEach(id=>{
      const el = document.getElementById(id); if (!el) return;
      const handler = ()=>{
        if (id === 'posto'){ rebaseDeltasAfterPostoChange(); return; }
        if (id === 'ipasgo' && isIpasgoManual()){ return; } // só recalcula quando valorIpasgo mudar
        scheduleRecompute();
      };
      el.addEventListener('change', handler, true);
      el.addEventListener('input',  handler, true);
      el.addEventListener('blur',   handler, true);
    });

    const vi = document.getElementById('valorIpasgo');
    if (vi){
      let last = vi.value;
      const h = ()=>{
        if (!isIpasgoManual()) return;
        if (vi.value !== last){ last = vi.value; scheduleRecompute(); }
      };
      vi.addEventListener('input',  h, true);
      vi.addEventListener('change', h, true);
      vi.addEventListener('blur',   h, true);
    }
  }

  function attachReajusteHooks(){
    document.addEventListener('click', (ev)=>{
      const t = ev.target; if (!t) return;
      if (t.matches('#btnAplicarReajuste, [data-action="aplicar-reajuste"], .btn-aplicar-reajuste')){
        window.__reajuste_aplicado = true;
        setTimeout(()=>{ window.__deltaBaseAnual = snapshotResumoAnual(); document.body.classList.add('deltas-on'); }, 30);
        setTimeout(scheduleRecompute, 40);
      }
      if (t.matches('#btnLimparReajuste, [data-action="limpar-reajuste"], .btn-limpar-reajuste, .btn-reset-reajuste')){
        window.__reajuste_aplicado = false;
        document.body.classList.remove('deltas-on');
        scheduleRecompute();
      }
    }, true);
  }

  function boot(){
    if (window.__reajuste_aplicado) document.body.classList.add('deltas-on');
    attachInputs();
    attachReajusteHooks();
    scheduleRecompute();
    setTimeout(scheduleRecompute, 60);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
/* ===== end v208-lite ===== */

/* ===== end v209 ===== */

/* =================== fim v220 =================== */





// v231 — Recalc imediato do Resumo Adicional Férias e 13º ao alterar apenas o posto
(function () {
  function triggerFromPosto() {
    try {
      if (typeof window.computeDetalhamento === "function") {
        window.computeDetalhamento();
      }
    } catch (e) {
      console && console.error && console.error("Erro ao recalcular Férias/13º em alteração de posto", e);
    }
  }

  function bindRecalcPosto() {
    const el = document.getElementById("posto");
    if (!el) return;
    ["change", "input"].forEach((evt) => {
      el.addEventListener(evt, triggerFromPosto, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindRecalcPosto);
  } else {
    bindRecalcPosto();
  }
})();
;
