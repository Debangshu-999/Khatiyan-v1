const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadMetroSystem() {
  const js = ts.transpileModule(read("src/features/discovery/metro/metro-system.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "require", js)(module, module.exports, () => ({}));
  return module.exports;
}

const KOLKATA = {
  code: "kolkata",
  name: "Kolkata Metro",
  centreLatitude: 22.5646,
  centreLongitude: 88.351,
  lines: [
    {
      code: "kol-blue",
      name: "Blue Line",
      colour: "#1F6FD0",
      fromStation: "Dakshineswar",
      toStation: "Kavi Subhash",
      stations: [
        { code: "kol-park-street", name: "Park Street", otherLineColours: [] },
        { code: "kol-esplanade", name: "Esplanade", otherLineColours: ["#1E9E5A"] },
      ],
    },
    {
      code: "kol-green",
      name: "Green Line",
      colour: "#1E9E5A",
      fromStation: "Howrah Maidan",
      toStation: "Salt Lake Sector V",
      stations: [
        { code: "kol-esplanade", name: "Esplanade", otherLineColours: ["#1F6FD0"] },
        { code: "kol-sealdah", name: "Sealdah", otherLineColours: [] },
      ],
    },
  ],
};

test("the picker starts on the current city, Kolkata when no location is known", () => {
  const { defaultMetroCity, METRO_CITIES } = loadMetroSystem();
  assert.equal(defaultMetroCity({ latitude: 22.5638, longitude: 88.3507 }).code, "kolkata");
  assert.equal(defaultMetroCity({ latitude: 17.385, longitude: 78.4867 }).code, "hyderabad");
  assert.equal(defaultMetroCity({ latitude: null, longitude: null }).code, "kolkata");
  // The list is metro cities only, so a city with none starts with nothing picked.
  assert.equal(defaultMetroCity({ city: "Siliguri", latitude: 26.7271, longitude: 88.3953 }), null);
  assert.equal(METRO_CITIES.some((city) => city.name === "Siliguri"), false);
  assert.equal(METRO_CITIES[0].name, "Kolkata");
});

test("only a city with a seeded system has lines, every other one is under construction", () => {
  const { systemForCity } = loadMetroSystem();
  assert.equal(systemForCity([KOLKATA], "kolkata")?.code, "kolkata");
  assert.equal(systemForCity([KOLKATA], "hyderabad"), null);
});

test("select all ticks every station on a line, and unticks them again", () => {
  const { toggleLine } = loadMetroSystem();
  const line = KOLKATA.lines[0];
  const ticked = toggleLine(["kol-sealdah"], line);
  assert.deepEqual([...ticked].sort(), ["kol-esplanade", "kol-park-street", "kol-sealdah"]);
  assert.deepEqual(toggleLine(ticked, line), ["kol-sealdah"]);
});

test("an interchange is one code, so ticking it on one line shows it ticked on the other", () => {
  const { toggleStation, ticksOnLine } = loadMetroSystem();
  const ticked = toggleStation([], "kol-esplanade");
  assert.equal(ticksOnLine(ticked, KOLKATA.lines[0]), 1);
  assert.equal(ticksOnLine(ticked, KOLKATA.lines[1]), 1);
  assert.deepEqual(toggleStation(ticked, "kol-esplanade"), []);
});

test("the results say which ticked stations they are near, and an empty list names them", () => {
  const { metroResultLine, tickedStations } = loadMetroSystem();
  const names = tickedStations([KOLKATA], ["kol-esplanade", "kol-sealdah"]).map((station) => station.name);
  assert.deepEqual(names, ["Esplanade", "Sealdah"]);
  assert.equal(metroResultLine(names, 0), "No matching listing within 5 km of Esplanade, Sealdah");
  assert.equal(metroResultLine(names, 1), "1 listing within 5 km of Esplanade, Sealdah");
  assert.equal(metroResultLine(["A", "B", "C", "D"], 3), "3 listings within 5 km of A, B and 2 more");
});

test("filters: the codes default to none, count once, and travel joined", () => {
  const modal = read("src/features/discovery/components/property-filter-modal.tsx");
  assert.match(modal, /metroStationCodes: string\[\];/);
  assert.match(modal, /metroStationCodes: \[\],/);
  assert.match(modal, /if \(filters\.metroStationCodes\.length > 0\) count \+= 1;/);
  const api = read("src/store/services/discovery-api.ts");
  assert.match(api, /metroStationCodes: params\.metroStationCodes\?\.join\(","\)/);
  assert.match(api, /nearestMetroStationName\?: string \| null;/);
});

test("searching a place clears the ticks, so the list does not silently stay on metro", () => {
  const screen = read("app/(tabs)/discovery.tsx");
  const body = (name) => {
    const start = screen.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    return screen.slice(start, start + 500);
  };
  for (const name of ["handleSearch", "selectSuggestion", "clearSearch", "runAiSearch"]) {
    assert.match(body(name), /clearMetroStations\(\)/, name);
  }
  assert.match(screen, /metroStationCodes: appliedFilters\.metroStationCodes/);
  assert.match(screen, /hasActiveSearch = byMetro \|\| manualSelection/);
  // A ticked search has no area, so nothing is labelled as elsewhere.
  assert.match(screen, /splitPropertiesByArea\(properties, byMetro \? "" : searchedArea\)/);
});

test("the page has two tabs, always, and the line screen goes back to the tab", () => {
  const modal = read("src/features/discovery/components/property-filter-modal.tsx");
  assert.match(modal, /label: "General search"/);
  assert.match(modal, /label: "Search along metro"/);
  assert.match(modal, /onRequestClose=\{handleBack\}/);
  assert.match(modal, /if \(openLine\) \{\s*setOpenLineCode\(null\);\s*return;/);
  assert.match(modal, /<MetroLineScreen/);
});

test("the first page is a city picker, with no station search", () => {
  const tab = read("src/features/discovery/metro/metro-tab.tsx");
  assert.match(tab, /<SelectField/);
  assert.match(tab, /labelOnBorder/);
  assert.match(tab, /METRO_CITIES\.map/);
  assert.doesNotMatch(tab, /SearchField/);
  assert.match(tab, /systemForCity\(systems, city\.code\)/);
  const field = read("src/components/select-field.tsx");
  assert.match(field, /labelOnBorder \? \(/);
  assert.match(tab, /<MetroUnderConstruction/);
  assert.match(tab, /under-construction\.png/);
  assert.match(tab, />Work in Progress</);
  assert.doesNotMatch(tab, /not ready in|Kolkata for now/);
  const screen = read("app/(tabs)/discovery.tsx");
  assert.match(screen, /deviceLocation=\{\{ city: location\.city, latitude: location\.latitude, longitude: location\.longitude \}\}/);
  // The picked city outlives a trip into a line, so it lives on the page.
  const modal = read("src/features/discovery/components/property-filter-modal.tsx");
  assert.match(modal, /pickedCityCode=\{pickedCityCode\}/);
});

test("the tab has the chips with a cross, the lines and the credit", () => {
  const tab = read("src/features/discovery/metro/metro-tab.tsx");
  assert.match(tab, /Remove \$\{station\.name\}/);
  assert.match(tab, /Station locations © OpenStreetMap contributors\. Powered by Geoapify/);
  assert.match(tab, /openstreetmap\.org\/copyright/);
  assert.match(tab, /geoapify\.com/);
  assert.match(tab, /loadFailure\(systemsQuery\)/);
  assert.match(tab, /<SkeletonBoundary>/);
});

test("the line screen has the line's colour, Select all, the interchange pill and the pinned button", () => {
  const line = read("src/features/discovery/metro/metro-line-screen.tsx");
  assert.match(line, /backgroundColor: line\.colour/);
  assert.match(line, /Select all/);
  assert.match(line, /Interchange/);
  assert.match(line, /otherLineColours/);
  assert.match(line, /Select stations/);
});

test("the metro tab has no Reset or Search: Select stations runs the search, and leaving with changed ticks applies them", () => {
  const modal = read("src/features/discovery/components/property-filter-modal.tsx");
  assert.match(modal, /pageTab === "metro" \? null : \(/);
  assert.match(modal, /onDone=\{\(\) => onApply\(filters\)\}/);
  assert.match(modal, /filters\.metroStationCodes\.join\(\) !== codesOnOpening\.current/);
  const line = read("src/features/discovery/metro/metro-line-screen.tsx");
  assert.match(line, /onPress=\{onDone\}/);
  assert.match(read("src/features/discovery/metro/metro-tab.tsx"), /marginTop: "auto"/);
});

test("the page's own back arrow runs the same back as the phone, from either tab, so ticks are not lost", () => {
  const modal = read("src/features/discovery/components/property-filter-modal.tsx");
  assert.doesNotMatch(modal, /onPress=\{onClose\}/);
  assert.match(modal, /onPress=\{handleBack\}/);
  assert.doesNotMatch(modal, /pageTab === "metro" && filters\.metroStationCodes\.join/);
});

test("picking a city or area ends the ticks as well", () => {
  const screen = read("app/(tabs)/discovery.tsx");
  for (const name of ["onAreaSelect", "onCitySelect"]) {
    const start = screen.indexOf(`${name}={(`);
    assert.match(screen.slice(start, start + 120), /clearMetroStations\(\)/, name);
  }
});

test("while ticked, the page talks about stations, not the searched place", () => {
  const screen = read("app/(tabs)/discovery.tsx");
  assert.match(screen, /searchLocationLabel = byMetro\s*\? metroSearchLabel\(appliedFilters\.metroStationCodes\.length\)/);
  assert.match(screen, /byMetro \? "No listings near these stations" : "No listings found"/);
  assert.match(screen, /byMetro \? "Change stations" : "Try a different location"/);
});

test("ticked stations show four rows, then See more, under a count and Clear all", () => {
  const { chipRowsHeight, stationCountLabel } = loadMetroSystem();
  assert.equal(chipRowsHeight(34, 10, 4), 166);
  assert.equal(stationCountLabel(1), "1 station selected");
  assert.equal(stationCountLabel(26), "26 stations selected");
  const tab = read("src/features/discovery/metro/metro-tab.tsx");
  assert.match(tab, /MAX_CHIP_ROWS = 4/);
  assert.match(tab, /stationCountLabel\(stations\.length\)/);
  assert.match(tab, /Clear all/);
  assert.match(tab, /onPress=\{\(\) => onChange\(\[\]\)\}/);
  assert.match(tab, /expanded \? "See less" : "See more"/);
  assert.match(tab, /overflow: "hidden"/);
});

test("the Searched around pill counts the stations", () => {
  const { metroSearchLabel } = loadMetroSystem();
  assert.equal(metroSearchLabel(26), "26 metro stations");
  assert.equal(metroSearchLabel(1), "1 metro station");
});

test("the card says how far it is from the nearest ticked station", () => {
  const card = read("src/features/discovery/components/property-listing-card.tsx");
  assert.match(card, /property\.nearestMetroStationName/);
});

test("no semicolons in the metro copy", () => {
  for (const file of ["src/features/discovery/metro/metro-tab.tsx", "src/features/discovery/metro/metro-line-screen.tsx"]) {
    for (const match of read(file).matchAll(/>\s*([A-Z][^<>{}]*)\s*</g)) {
      assert.doesNotMatch(match[1], /;/, match[1]);
    }
  }
});
