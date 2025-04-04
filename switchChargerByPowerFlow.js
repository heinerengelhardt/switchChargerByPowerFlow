/// Globale Variablen
const runInterval = 3;                      // Intervall in Minuten in dem das Skript ausgeführt wird
const runFromHour = 9;                      // Stunde ab der die Abfrage der API und starten des Prozesses stattfindet
const runToHour = 20;                       // Stunde bis zu der die Abfrage der API und starten des Prozesses stattfindet

const minPvProductionBeforeLoading = 3.2;   // definiert die PV Produktion in kW ab der geladen werden kann
const minPvProductionWhileLoading = 3.2;    // definiert die PV Produktion in kW ab der weiter geladen werden kann
const minPvProductionFinalLoading = 2;      // definiert die PV Produktion in kW ab der immernoch weiter geladen werden kann
const minDeltaPvLoad = 3;                   // definiert die Ziel Differenz zwischen PV Produktion und dem Hausverbrauch zum Ladestart
const minStorageLevelBeforeLoading = 20;    // definiert den Speicherfüllstand in % ab dem geladen werden kann
const minStorageLevelWhileLoading = 50;     // definiert den Speicherfüllstand in % bei dem weiter geladen werden kann
const minStorageLevelFinalLoading = 90;     // definiert den Speicherfüllstand in % bei dem immernoch weiter geladen werden kann

const targetCycles = 3;                     // Anzahl der Zyklen die erreicht werden müssen bis das Laden startet bzw. stopt
let cyclesBeforeLoadingStarts = 0;          // Anzahl Timer Zyklen bevor das Laden starten soll
let cyclesBeforeLoadingStops = 0;           // Anzahl Timer Zyklen bevor das Laden stoppen soll
let isCharging = false;                     // Ladestatus "wird geladen" oder "wird nicht geladen"

/// Nach definierten Parametern (Hausverbruach, Überschuss, etc.) den Auflader "an"" oder "aus"" schalten
function switchChargerByPowerFlow(connections, GRID, LOAD, PV, STORAGE) {
    // Abfrage ob Netzeinspeisung vorliegt
    gridFeedIn = connections.some(function(conn) {
        return conn.from === "LOAD" && conn.to === "Grid";
    });
    
    // Abfrage ob Netzbezug vorliegt
    gridConsumption = connections.some(function(conn) {
        return conn.from === "GRID" && conn.to === "Load";
    });    
    
    // definiert die aktuelle Differenz zwischen PV Produktion und dem Hausverbrauch    
    currentDeltaPvLoad = PV.currentPower - LOAD.currentPower;

    // Ausgabe der Monitoring Werte
    print("Grid: ", GRID.currentPower, "kW | ",                      // Netz aktuelle Leistung
          "Load: ", LOAD.currentPower, "kW | ",                      // Verbrauch aktuelle Leistung
          "PV: ", PV.currentPower, "kW | ",                          // PV aktuelle Leistung
          "StorageChargLevel: ", STORAGE.chargeLevel, "% | ",        // Speicher aktueller Ladezustand
          "GridConsumption : ", gridConsumption ? "YES" : "NO | ",   // Netzbezug vorhanden oder nicht     
          "GridFeedIn : ", gridFeedIn ? "YES" : "NO");               // Netzeinspeisung vorhanden oder nicht

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Es wird nicht geladen und das Laden soll starten.
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    
    if( PV.currentPower >= minPvProductionBeforeLoading &&       // PV Produktion größer-gleich PV Schwellwert
        PV.currentPower > LOAD.currentPower &&                   // PV Produktion größer Hausverbrauch
        currentDeltaPvLoad >= minDeltaPvLoad &&                  // Delta zwischen PV Produktion und Hausverbrauch größer-gleich Delta Schwellwert
        STORAGE.chargeLevel >= minStorageLevelBeforeLoading &&   // Speicherfüllgrad größer-gleich als Speicher Schwellwert vor Laden
        isCharging == false ) {                                  // Es wird nicht geladen
        
        cyclesBeforeLoadingStarts = cyclesBeforeLoadingStarts + 1;
        
        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird nicht geladen und das Laden soll starten: ",
              "Zyklen Start: ", cyclesBeforeLoadingStarts, " | ",
              "Zyklen Stop: ", cyclesBeforeLoadingStops);

        // PV Überschuss sollte stabil über mindestens 2 Zyklen sein um den Ladevorgang zu starten. Verhindert ständiges an und aus schalten des Aufladers
        if( cyclesBeforeLoadingStarts >= targetCycles ) {
            Shelly.call("Switch.set", {'id': 0, 'on': true}); // Auflader anschalten und damit Starten des Ladens
            isCharging = true;
            cyclesBeforeLoadingStops = 0;
            print("----> Laden...: ",
              "Zyklen Start: ", cyclesBeforeLoadingStarts, " | ",
              "Zyklen Stop: ", cyclesBeforeLoadingStops);
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Es wird geladen und das Laden soll weiter gehen, trotz höherem Hausverbruach mal zwischendurch
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    
    else if( PV.currentPower >= minPvProductionWhileLoading &&       // PV Produktion größer-gleich PV Schwellwert
             STORAGE.chargeLevel >= minStorageLevelWhileLoading &&   // Speicherfüllgrad größer-gleich als Speicher Schwellwert während Laden
             isCharging == true ) {                                  // Es wird geladen
        cyclesBeforeLoadingStarts = cyclesBeforeLoadingStarts + 1;
        cyclesBeforeLoadingStops = 0;
        
        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird geladen und das Laden soll Zwischendurch weiter gehen: ",
              "Zyklen Start: ", cyclesBeforeLoadingStarts, " | ",
              "Zyklen Stop: ", cyclesBeforeLoadingStops);
    }
    
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Es wird geladen und das Laden soll weiter gehen, auch gegen Abend wenn die PV Leistung etwas geringer aber Speicher voller ist
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    
    else if( PV.currentPower >= minPvProductionFinalLoading &&       // PV Produktion größer-gleich PV Schwellwert
             STORAGE.chargeLevel >= minStorageLevelFinalLoading &&   // Speicherfüllgrad größer-gleich als Speicher Schwellwert während Laden
             isCharging == true ) {                                  // Es wird geladen
        cyclesBeforeLoadingStarts = cyclesBeforeLoadingStarts + 1;
        cyclesBeforeLoadingStops = 0;
        
        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird geladen und das Laden soll Abends weiter gehen: ",
              "Zyklen Start: ", cyclesBeforeLoadingStarts, " | ",
              "Zyklen Stop: ", cyclesBeforeLoadingStops);
    }    

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Es wird geladen und das Laden soll angehalten werden.
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    
    else if( PV.currentPower < minPvProductionWhileLoading &&    // PV Produktion kleiner PV Schwellwert
             isCharging == true ) {                              // Es wird geladen
        
        cyclesBeforeLoadingStops = cyclesBeforeLoadingStops + 1;        

        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird geladen und das Laden soll angehalten werden: ",
              "Zyklen Start: ", cyclesBeforeLoadingStarts, " | ",
              "Zyklen Stop: ", cyclesBeforeLoadingStops);

        // Bei mindestens 2 Zyklen ohne Überschuss wird der Ladevorgang angehalten. Verhindert ständiges an und aus schalten des Aufladers
        if( cyclesBeforeLoadingStops >= targetCycles ) {
            Shelly.call("Switch.set", {'id': 0, 'on': false}); // Auflader abschalten und damit Stoppen des Ladens
            isCharging = false;
            cyclesBeforeLoadingStarts = 0;
            print("----> Nicht Laden...: ",
              "Zyklen Start: ", cyclesBeforeLoadingStarts, " | ",
              "Zyklen Stop: ", cyclesBeforeLoadingStops);
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Es wird nicht geladen und das soll auch so bleiben.
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    
    else if( PV.currentPower < minPvProductionBeforeLoading &&   // PV Produktion kleiner PV Schwellwert
             isCharging == false ) {                             // Es wird nicht geladen
        
        cyclesBeforeLoadingStops = cyclesBeforeLoadingStops + 1;
        cyclesBeforeLoadingStarts = 0;

        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird nicht geladen und das soll auch so bleiben: ",
              "Zyklen Start: ", cyclesBeforeLoadingStarts, " | ",
              "Zyklen Stop: ", cyclesBeforeLoadingStops);
    }
    else {    
        print("=*=*=*=*=*=*=*= Dieser Fall ist aktuell nicht abgedeckt! =*=*=*=*=*=*=*=");        
    }
}

/// SolarEdge Monitoring API aufrufen, Messwerte abfragen und damit die Fnktion zum schalten des Laders aufrufen
function process() {  
    print("===================================================================================");
    print("Prozesszyklus gestartet: ", Date());

    // Soll am Tag nur in einem definiertem Zeitfenster laufen und ausserhalb abgeschaltet sein
    if( !(new Date().getHours() >= runFromHour  && new Date().getHours() < runToHour ) ) {
        print("Ladezeitruamm noch nicht erreich: ", Date());
        Shelly.call("Switch.set", {'id': 0, 'on': false}); // Auflader abschalten und damit Stoppen des Ladens
        isCharging = false;
        return;
    }

    // Auth. Credentials für API Aufruf
    let siteId = "4711";
    let apiFunction = "currentPowerFlow";
    let apiKey = "0815";    

    // URL der SE REST-API    
    let apiUrl = "https://monitoringapi.solaredge.com/site/" + siteId + "/" + apiFunction + ".json?api_key=" + apiKey;

    // HTTP GET-Anfrage senden
    Shelly.call(
        "HTTP.GET", {
            url: apiUrl
        },
        function (response, error_code, error_msg) {
            if (error_code === 0) {
                if (response && response.body) {
                    try {
                        // JSON-Dokument parsen
                        let jsonData = JSON.parse(response.body);
                                       
                        // PV Ertrag und Co. prüfen und nach definierten Regeln den Auflader an oder aus schalten
                        switchChargerByPowerFlow(jsonData.siteCurrentPowerFlow.connections,
                                                 jsonData.siteCurrentPowerFlow.GRID,
                                                 jsonData.siteCurrentPowerFlow.LOAD,
                                                 jsonData.siteCurrentPowerFlow.PV,
                                                 jsonData.siteCurrentPowerFlow.STORAGE);
                    
                    }
                    catch (e) {
                        print("Fehler beim Parsen des JSON:", e, "Antwort:", response.body);
                    }
                }
                else {
                    print("Keine Antwortdaten (response.body ist undefiniert).");
                }
            }
            else {
                print("HTTP-Fehler:", error_code, "Nachricht:", error_msg);
            }
        }
    );
};

/// Timer starten mit Intervall, Wiederholung und Funktionsaufruf
Timer.set(
    1000 * 60 * runInterval, // Wiederholung in Millisekunden
    true, // Timer wiederholen
    process // Funktion die in jedem Zyklus aufgerufen wird
);
