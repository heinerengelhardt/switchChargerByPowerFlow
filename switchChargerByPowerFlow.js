/// ===================================================================================
/// PV-Überschuss Laden – State Machine Variante
/// ===================================================================================

/// Konfiguration: Timing
var runInterval = 3;    // Intervall in Minuten
var runFromHour = 10;   // Startzeit
var runToHour = 20;     // Endzeit

/// Konfiguration: Schwellwerte zum Starten (IDLE → PENDING_START → CHARGING)
var minPvProductionBeforeLoading = 3.2;   // PV Produktion in kW
var minDeltaPvLoad = 3;                   // Ziel-Differenz PV - Hausverbrauch in kW
var minStorageLevelBeforeLoading = 20;    // Speicherfüllstand in %

/// Konfiguration: Schwellwerte zum Weiterladen (CHARGING bleibt)
var minPvProductionWhileLoading = 3.2;    // PV Produktion in kW
var minStorageLevelWhileLoading = 50;     // Speicherfüllstand in %

/// Konfiguration: Schwellwerte zum Weiterladen Abends (CHARGING bleibt, PV geringer, Speicher voller)
var minPvProductionFinalLoading = 2;      // PV Produktion in kW
var minStorageLevelFinalLoading = 90;     // Speicherfüllstand in %

/// Konfiguration: Zyklen-Hysterese
var targetCycles = 3;

/// Zustandsdefinitionen
var STATE_IDLE = "IDLE";
var STATE_PENDING_START = "PENDING_START";
var STATE_CHARGING = "CHARGING";
var STATE_PENDING_STOP = "PENDING_STOP";

/// Laufzeit-Zustand
var state = STATE_IDLE;
var cycleCounter = 0;
var apiErrorCount = 0;

/// ===================================================================================
/// Bedingungsprüfungen – hier zentral definiert, pro Zustand aufgerufen
/// ===================================================================================

/// Prüft ob die Startbedingungen erfüllt sind (für IDLE → PENDING_START und PENDING_START → CHARGING)
function shouldStartCharging(PV, LOAD, STORAGE) {
    return PV.currentPower >= minPvProductionBeforeLoading &&
           PV.currentPower > LOAD.currentPower &&
           (PV.currentPower - LOAD.currentPower) >= minDeltaPvLoad &&
           STORAGE.chargeLevel >= minStorageLevelBeforeLoading;
}

/// Prüft ob die Bedingungen zum Weiterladen erfüllt sind (normale + Abend-Bedingung)
function shouldKeepCharging(PV, STORAGE) {
    // Normale Bedingung: PV und Speicher über Schwellwert
    var normalCondition = PV.currentPower >= minPvProductionWhileLoading &&
                          STORAGE.chargeLevel >= minStorageLevelWhileLoading;

    // Abend-Bedingung: PV geringer, aber Speicher fast voll
    var finalCondition = PV.currentPower >= minPvProductionFinalLoading &&
                         STORAGE.chargeLevel >= minStorageLevelFinalLoading;

    return normalCondition || finalCondition;
}

/// ===================================================================================
/// Aktionen – Lader schalten
/// ===================================================================================

function chargerOn() {
    Shelly.call("Switch.set", { 'id': 0, 'on': true });
    print("AKTION: Lader EIN");
}

function chargerOff() {
    Shelly.call("Switch.set", { 'id': 0, 'on': false });
    print("AKTION: Lader AUS");
}

/// ===================================================================================
/// State Machine – Zustandsübergänge
/// ===================================================================================

function transition(newState) {
    print("ÜBERGANG: " + state + " → " + newState);
    state = newState;
    cycleCounter = 0;
}

function processState(PV, LOAD, STORAGE, connections) {
    // Monitoring-Ausgabe
    var gridFeedIn = connections.some(function(conn) {
        return conn.from === "LOAD" && conn.to === "Grid";
    });
    var gridConsumption = connections.some(function(conn) {
        return conn.from === "GRID" && conn.to === "Load";
    });

    print("State: " + state + " | Zyklus: " + cycleCounter +
          " | PV: " + PV.currentPower + "kW" +
          " | Load: " + LOAD.currentPower + "kW" +
          " | Storage: " + STORAGE.chargeLevel + "%" +
          " | Grid: " + (gridConsumption ? "Bezug" : (gridFeedIn ? "Einspeisung" : "---")));

    // API war erfolgreich → Fehlerzähler zurücksetzen
    apiErrorCount = 0;

    // ---------------------------------------------------------------
    // IDLE: Warten auf Startbedingungen
    // ---------------------------------------------------------------
    if (state === STATE_IDLE) {
        if (shouldStartCharging(PV, LOAD, STORAGE)) {
            transition(STATE_PENDING_START);
            cycleCounter = 1; // Dieser Zyklus zählt bereits
            print("  Startbedingungen erstmals erfüllt (" + cycleCounter + "/" + targetCycles + ")");
        }
    }

    // ---------------------------------------------------------------
    // PENDING_START: Startbedingungen müssen targetCycles lang stabil sein
    // ---------------------------------------------------------------
    else if (state === STATE_PENDING_START) {
        if (shouldStartCharging(PV, LOAD, STORAGE)) {
            cycleCounter = cycleCounter + 1;
            print("  Startbedingungen stabil (" + cycleCounter + "/" + targetCycles + ")");

            if (cycleCounter >= targetCycles) {
                chargerOn();
                transition(STATE_CHARGING);
            }
        } else {
            // Bedingungen nicht mehr erfüllt → zurück auf IDLE
            print("  Startbedingungen weggefallen → zurück zu IDLE");
            transition(STATE_IDLE);
        }
    }

    // ---------------------------------------------------------------
    // CHARGING: Aktiv laden – prüfen ob Bedingungen noch halten
    // ---------------------------------------------------------------
    else if (state === STATE_CHARGING) {
        if (shouldKeepCharging(PV, STORAGE)) {
            print("  Weiterladen – Bedingungen erfüllt");
        } else {
            // Bedingungen nicht mehr erfüllt → Abschalt-Hysterese starten
            transition(STATE_PENDING_STOP);
            cycleCounter = 1;
            print("  Stoppbedingungen erstmals erfüllt (" + cycleCounter + "/" + targetCycles + ")");
        }
    }

    // ---------------------------------------------------------------
    // PENDING_STOP: Stoppbedingungen müssen targetCycles lang anliegen
    // ---------------------------------------------------------------
    else if (state === STATE_PENDING_STOP) {
        if (shouldKeepCharging(PV, STORAGE)) {
            // Bedingungen wieder okay → zurück zum Laden
            print("  Bedingungen wieder erfüllt → zurück zu CHARGING");
            transition(STATE_CHARGING);
        } else {
            cycleCounter = cycleCounter + 1;
            print("  Stoppbedingungen stabil (" + cycleCounter + "/" + targetCycles + ")");

            if (cycleCounter >= targetCycles) {
                chargerOff();
                transition(STATE_IDLE);
            }
        }
    }
}

/// ===================================================================================
/// API-Fehler-Handling
/// ===================================================================================

function handleApiError(errorMsg) {
    apiErrorCount = apiErrorCount + 1;
    print("API-FEHLER (" + apiErrorCount + "/" + targetCycles + "): " + errorMsg);

    // Nach targetCycles fehlgeschlagenen Calls: Sicherheitsabschaltung
    if (apiErrorCount >= targetCycles && (state === STATE_CHARGING || state === STATE_PENDING_STOP)) {
        print("API wiederholt fehlgeschlagen während Laden → Sicherheitsabschaltung");
        chargerOff();
        transition(STATE_IDLE);
    }
}

/// ===================================================================================
/// Hauptprozess: API abrufen und State Machine füttern
/// ===================================================================================

function process() {
    print("===================================================================================");
    print("Prozesszyklus: " + Date() + " | State: " + state);

    // Zeitfenster-Prüfung
    var currentHour = new Date().getHours();
    if (currentHour < runFromHour || currentHour >= runToHour) {
        print("Außerhalb Ladezeitraum (" + runFromHour + "-" + runToHour + "h)");
        if (state === STATE_CHARGING || state === STATE_PENDING_STOP) {
            chargerOff();
        }
        transition(STATE_IDLE);
        return;
    }

    // SolarEdge API abrufen
    var siteId = "<my_siteId>";
    var apiKey = "<my_apiKey>";
    var apiUrl = "https://monitoringapi.solaredge.com/site/" + siteId +
                 "/currentPowerFlow.json?api_key=" + apiKey;

    Shelly.call("HTTP.GET", { url: apiUrl },
        function(response, error_code, error_msg) {
            if (error_code !== 0) {
                handleApiError("HTTP " + error_code + ": " + error_msg);
                return;
            }
            if (!response || !response.body) {
                handleApiError("Leere Antwort");
                return;
            }
            try {
                var data = JSON.parse(response.body);
                var flow = data.siteCurrentPowerFlow;
                processState(flow.PV, flow.LOAD, flow.STORAGE, flow.connections);
            } catch (e) {
                handleApiError("JSON Parse: " + e);
            }
        }
    );
}

/// ===================================================================================
/// Timer starten
/// ===================================================================================

Timer.set(1000 * 60 * runInterval, true, process);
