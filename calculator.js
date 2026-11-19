const sharedFields = [
  { key: "years", label: "Ownership period (years)", value: 3, positive: true },
  { key: "hours", label: "Operating hours per year", value: 6000, positive: true, max: 8760 },
  { key: "target", label: "Required cost-per-token savings (%)", value: 10, max: 100 },
  { key: "demand", label: "Sustained demand (tokens/sec)", value: 1150000, positive: true },
  { key: "workload", label: "Workload and service targets", value: "Long-context replay", hint: "Use the same model, quality, and latency targets for both systems." },
];

const systemFields = [
  { key: "accelerators", label: "Accelerators", baseline: 8, proposed: 8, whole: true },
  { key: "chipMemory", label: "Accelerator memory per chip (TB)", baseline: 0.3, proposed: 0.3 },
  { key: "trays", label: "Memory trays", baseline: 0, proposed: 1, whole: true },
  { key: "trayMemory", label: "Memory per tray (TB)", baseline: 0, proposed: 16 },
  { key: "throughput", label: "Throughput at service target (tokens/sec)", baseline: 100000, proposed: 120000, positive: true },
  { key: "systemCost", label: "Upfront system cost excluding X-Mem ($)", baseline: 1080000, proposed: 1080000 },
  { key: "memoryCost", label: "Upfront installed X-Mem cost ($)", baseline: 0, proposed: 108000 },
  { key: "operatingCost", label: "Operating cost per system-hour ($)", baseline: 40, proposed: 42 },
];

function calculate(shared, baseline, proposed) {
  const lifetimeHours = shared.years * shared.hours;
  const target = shared.target / 100;

  function summarize(system) {
    const lifetimeCost = system.systemCost + system.memoryCost + system.operatingCost * lifetimeHours;
    const hourlyCost = lifetimeCost / lifetimeHours;
    const systems = Math.ceil(shared.demand / system.throughput);
    const acceleratorMemory = system.accelerators * system.chipMemory;
    const trayMemory = system.trays * system.trayMemory;
    return {
      lifetimeCost,
      hourlyCost,
      systems,
      acceleratorMemory,
      trayMemory,
      totalMemory: acceleratorMemory + trayMemory,
      efficiency: hourlyCost === 0 ? null : system.throughput / hourlyCost,
      tokenCost: (hourlyCost / system.throughput) * (1e6 / 3600),
      fleetCost: systems * lifetimeCost,
    };
  }

  const base = summarize(baseline);
  const next = summarize(proposed);
  const allowedLifetimeCost = base.lifetimeCost * (1 - target) * (proposed.throughput / baseline.throughput);
  const nonMemoryCost = proposed.systemCost + proposed.operatingCost * lifetimeHours;
  const tolerance = 4 * Number.EPSILON * Math.max(allowedLifetimeCost, nonMemoryCost);
  const rawCeiling = allowedLifetimeCost - nonMemoryCost;
  const rawGap = rawCeiling - proposed.memoryCost;
  const ceiling = Number.isFinite(rawCeiling) && Math.abs(rawCeiling) <= tolerance ? 0 : rawCeiling;
  const gap = Number.isFinite(rawGap) && Math.abs(rawGap) <= tolerance ? 0 : rawGap;
  return {
    base,
    next,
    target,
    ceiling,
    gap,
    tokenSavings: 1 - next.tokenCost / base.tokenCost,
    fleetSavings: 1 - next.fleetCost / base.fleetCost,
  };
}

const format = (options) => new Intl.NumberFormat("en-US", options).format;
const number = format({ maximumFractionDigits: 0 });
const memory = format({ minimumFractionDigits: 1, maximumFractionDigits: 2 });
const dollars = format({ style: "currency", currency: "USD", maximumFractionDigits: 0 });
const hourlyDollars = format({ style: "currency", currency: "USD", maximumFractionDigits: 2 });
const tokenDollars = format({ style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 3 });
const percent = format({ style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const byId = (id) => document.getElementById(id);
const setText = (node, text) => {
  if (node.textContent !== text) node.textContent = text;
};

const rows = [
  ["acceleratorMemory", "Accelerator memory (TB)", "Accelerator count × memory per accelerator", memory],
  ["trayMemory", "X-Mem capacity (TB)", "Tray count × capacity per tray", memory],
  ["totalMemory", "Total physical memory (TB)", "Separate memory tiers with different performance", memory],
  ["efficiency", "Throughput per $1 of hourly cost", "Tokens/sec divided by dollars/hour; not applicable when hourly cost is zero", number],
  ["hourlyCost", "All-in system cost per hour", "Upfront costs spread over operating hours, plus hourly operating cost", hourlyDollars],
  ["systems", "Whole systems needed", "Rounded up to meet the same demand", number],
  ["fleetCost", "Fleet TCO over ownership period", "Number of systems × lifetime cost per system", dollars],
  ["fleetSavings", "Fleet TCO savings", "Positive means the X-Mem fleet costs less at the same demand", percent],
].map(([key, label, hint, formatter]) => {
  const row = byId("comparison").insertRow();
  const heading = document.createElement("th");
  heading.scope = "row";
  heading.textContent = label;
  const note = document.createElement("small");
  note.textContent = hint;
  heading.append(note);
  row.append(heading);
  return { key, formatter, base: row.insertCell(), next: row.insertCell() };
});

function buildFields(group, fields) {
  return fields.map((field) => {
    const value = field[group] ?? field.value;
    const container = document.createElement("div");
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.id = `${group}-${field.key}`;
    label.htmlFor = input.id;
    label.textContent = field.label;
    input.defaultValue = value;
    if (typeof value === "number") {
      input.type = "number";
      input.required = true;
      input.min = 0;
      input.step = field.whole ? "1" : "any";
      if (field.max !== undefined) input.max = field.max;
    } else {
      container.classList.add("wide");
    }
    container.append(label, input);
    const note = document.createElement("small");
    note.id = `${input.id}-note`;
    input.setAttribute("aria-describedby", note.id);
    container.append(note);
    byId(`${group}-fields`).append(container);
    return { ...field, input, note };
  });
}

const groups = {
  shared: buildFields("shared", sharedFields),
  baseline: buildFields("baseline", systemFields),
  proposed: buildFields("proposed", systemFields),
};

function render() {
  const values = {};
  let errors = 0;
  for (const [group, fields] of Object.entries(groups)) {
    values[group] = {};
    for (const { key, input, note, hint, positive, max, whole } of fields) {
      const value = input.type === "number" ? input.valueAsNumber : input.value;
      let error = "";
      if (input.type === "number") {
        if (!Number.isFinite(value)) error = "Enter a number.";
        else if (positive && value <= 0) error = "Enter a number greater than 0.";
        else if (value < 0) error = "Enter 0 or a positive number.";
        else if (value > max) error = `Enter ${number(max)} or less.`;
        else if (whole && !Number.isSafeInteger(value)) error = "Enter a whole number within range.";
      }
      if (error) errors++;
      input.setAttribute("aria-invalid", String(Boolean(error)));
      note.classList.toggle("error", Boolean(error));
      setText(note, error || hint || "");
      values[group][key] = value;
    }
  }

  let results;
  let inputStatus = "Inputs ready";
  if (errors) {
    inputStatus = "Correct the highlighted inputs to see results.";
  } else {
    const { shared, baseline, proposed } = values;
    const calculation = calculate(shared, baseline, proposed);
    const { base, next, ...decision } = calculation;
    if (base.lifetimeCost === 0) {
      inputStatus = "Enter a positive baseline cost so percentage savings can be calculated.";
    } else if (![...Object.values(base), ...Object.values(next), ...Object.values(decision)]
      .every((value) => value === null || Number.isFinite(value))) {
      inputStatus = "These inputs are outside the calculation range. Try smaller or less extreme values.";
    } else {
      results = calculation;
    }
  }

  const status = byId("decision-status");
  const meets = results && results.gap >= 0;
  status.dataset.state = results ? (meets ? "pass" : "miss") : "waiting";
  setText(status, results ? (meets ? "Meets target" : "Misses target") : "Check inputs");
  setText(byId("input-status"), inputStatus);
  byId("input-status").classList.toggle("error", !results);
  setText(byId("baseline-token-cost"), results ? tokenDollars(results.base.tokenCost) : "—");
  setText(byId("proposed-token-cost"), results ? tokenDollars(results.next.tokenCost) : "—");
  setText(byId("token-savings"), results ? percent(results.tokenSavings) : "—");
  setText(byId("savings-target"), results ? percent(results.target) : "—");
  setText(byId("price-ceiling"), results ? dollars(results.ceiling) : "—");
  setText(byId("price-gap"), !results ? "" : results.gap === 0 ? "Installed cost is at the ceiling"
    : `${dollars(Math.abs(results.gap))} ${results.gap < 0 ? "over" : "under"} the ceiling at the entered price`);
  for (const { key, formatter, base, next } of rows) {
    const baseline = results?.base[key];
    const proposed = key === "fleetSavings" ? results?.fleetSavings : results?.next[key];
    setText(base, baseline == null ? "—" : formatter(baseline));
    setText(next, proposed == null ? "—" : formatter(proposed));
  }
}

const form = byId("calculator");
form.addEventListener("input", render);
form.addEventListener("reset", () => requestAnimationFrame(render));
form.addEventListener("submit", (event) => event.preventDefault());
render();
