const runInterval = 3;               // Intervall in Minuten in dem das Skript läuft
const cycles = 3;                    // Anzahl der Zyklen die erreicht werden müssen bis das Laden startet bzw. stopt
const thresholdPvProduction = 3.5;   // definiert die PV Produktion in kW ab der geladen werden kann
const thresholdDeltaPvLoad = 3;      // definiert die Ziel Differenz zwischen PV Produktion und dem Hausverbrauch zum Ladestart
const thresholdStorageLevel = 20;    // definiert den Speicherfüllstand in % ab dem geladen werden kann
const fromHour = 9;                  // Stunde ab der die Abfrage der API und starten des Prozesses stattfindet
const toHour = 20;                   // Stunde bis zu der die Abfrage der API und starten des Prozesses stattfindet
let pvSurplusTimeCycles = 0;         // Anzahl Timer Zyklen bevor das Laden startet
let noPvSurplusTimeCycles = 0;       // Anzahl Timer Zyklen bevor das Laden stoppt
let isCharging = false;              // Ladestatus "wird geladen" oder "wird nicht geladen"

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
    // Es wird nicht geladen und das Laden soll starten
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    
    if( PV.currentPower >= thresholdPvProduction &&       // PV Produktion größer Schwellwert
        PV.currentPower > LOAD.currentPower &&            // PV Produktion größer Hausverbrauch     
        STORAGE.chargeLevel >= thresholdStorageLevel &&   // Speicher voller als Schwellwert
        currentDeltaPvLoad >= thresholdDeltaPvLoad &&     // Delta zwischen PV Produktion und Hausverbrauch größer Schwellwert
        gridConsumption == false &&                       // Kein Netzbezug
        isCharging == false ) {                           // es wird nicht geladen
        
        // Überschuss Zyklus Zähler inkrementieren
        pvSurplusTimeCycles = pvSurplusTimeCycles + 1;
        
        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird nicht geladen und das Laden soll starten: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);

        // PV Überschuss sollte stabil über mindestens 2 Zyklen sein um den Ladevorgang zu starten. Verhindert ständiges an und aus schalten des Aufladers
        if( pvSurplusTimeCycles >= cycles ) {
            Shelly.call("Switch.set", {'id': 0, 'on': true}); // Auflader anschalten und damit Starten des Ladens
            isCharging = true;
            noPvSurplusTimeCycles = 0; // Anzahl Zyklen ohne erkanntem PV Überschuss zurücksetzen
            print("----> Laden... Zyklen: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);
        }
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Es wird geladen und das Laden soll weiter gehen 
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    
    else if( PV.currentPower >= thresholdPvProduction &&       // PV Produktion größer Schwellwert
             PV.currentPower > LOAD.currentPower &&            // PV Produktion größer Hausverbrauch 
             STORAGE.chargeLevel >= thresholdStorageLevel &&   // Speicher voller als Schwellwert
             gridConsumption == false &&                       // Kein Netzbezug             
             isCharging == true ) {                            // es wird geladen
                
        pvSurplusTimeCycles = pvSurplusTimeCycles + 1; // Überschuss Zyklus Zähler inkrementieren
        noPvSurplusTimeCycles = 0; // Anzahl Zyklen ohne erkanntem PV Überschuss zurücksetzen
        
        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird geladen und das Laden soll weiter gehen: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Es wird geladen und das Laden soll angehalten werden
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    
    else if( PV.currentPower < thresholdPvProduction &&   // PV Produktion kleiner Schwellwert
             isCharging == true ) {                       // es wird geladen
        
        // Ohne Überschuss Zyklus Zähler inkrementieren        
        noPvSurplusTimeCycles = noPvSurplusTimeCycles + 1;        

        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird geladen und das Laden soll angehalten werden: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);

        // Bei mindestens 2 Zyklen ohne Überschuss wird der Ladevorgang angehalten. Verhindert ständiges an und aus schalten des Aufladers
        if( noPvSurplusTimeCycles >= cycles ) {
            Shelly.call("Switch.set", {'id': 0, 'on': false}); // Auflader abschalten und damit Stoppen des Ladens
            isCharging = false;
            pvSurplusTimeCycles = 0; // Anzahl Zyklen mit erkanntem PV Überschuss zurücksetzen
            print("----> Nicht Laden... Zyklen: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);
        }
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Es wird nicht geladen und das soll auch so bleiben
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    
    else if( PV.currentPower < thresholdPvProduction &&   // PV Produktion kleiner Schwellwert
             isCharging == false ) {                      // es wird nicht geladen
        
        noPvSurplusTimeCycles = noPvSurplusTimeCycles + 1; // Ohne Überschuss Zyklus Zähler inkrementieren        
        pvSurplusTimeCycles = 0; // Anzahl Zyklen mit erkanntem PV Überschuss zurücksetzen

        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird nicht geladen und das soll auch so bleiben: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);
    }
    else {
        print("=*=*=*=*=*=*=*= Dieser Fall sollte nicht auftreten! =*=*=*=*=*=*=*=");
    }
}

function process() {  
    print("===================================================================================");
    print("Prozesszyklus gestartet: ", Date());

    // Soll am Tag nur in einem definiertem Zeitfenster laufen und ausserhalb abgeschaltet sein
    if( !(new Date().getHours() >= fromHour  && new Date().getHours() < toHour ) ) {
        print("Ladezeitruamm noch nicht erreich: ", Date());
        Shelly.call("Switch.set", {'id': 0, 'on': false}); // Auflader abschalten und damit Stoppen des Ladens
        isCharging = false;
        return;
    }

    // Auth. Credentials für API Aufruf
    let siteId = "mysiteId";
    let apiFunction = "currentPowerFlow";
    let apiKey = "myapiKey";    

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

Timer.set(
    1000 * 60 * runInterval, // Wiederholung in Millisekunden
    true, // Timer wiederholen?
    process // Funktion die in jedem Zyklus aufgerufen wird
);
