const runInterval = 3; // Skript läuft alle x Minuten
const cycles = 3; // Anzahl der Zyklen die erreicht werden müssen bis das Laden startet bzw. stopt
const pvProduction = 3; // definiert die PV Produktion in kW ab der geladen werden kann
const storageLevel = 10; // definiert den Speicherfüllstand in % ab dem geladen werden kann
const fromHour = 9; // Stunde ab der die Abfrage der API und starten des Prozesses stattfindet
const toHour = 20; // Stunde bis zu der die Abfrage der API und starten des Prozesses stattfindet
let pvSurplusTimeCycles = 0; // Anzahl Timer Zyklen bevor das Laden startet
let noPvSurplusTimeCycles = 0; // Anzahl Timer Zyklen bevor das Laden stoppt
let isCharging = false; // Ladestatus "wird geladen" oder "wird nicht geladen"

function switchChargerByPowerFlow(connections, GRID, LOAD, PV, STORAGE) {
    // Abfrage ob Netzeinspeisung vorliegt
    gridFeedIn = connections.some(function(conn) {
        return conn.from === "LOAD" && conn.to === "Grid";
    });

    // Ausgabe der Monitoring Werte
    print("GRID: ", GRID.currentPower, "kW | ", // Netz aktuelle Leistung
          "LOAD: ", LOAD.currentPower, "kW | ", // Verbrauch aktuelle Leistung
          "PV: ", PV.currentPower, "kW | ", // PV aktuelle Leistung
          "STORAGE: ", STORAGE.currentPower, "kW",  // Speicher aktuelle Leistung
          "STORAGE: ", STORAGE.chargeLevel, "% | ", // Speicher aktueller Ladezustand
          "GridFeedIn : ", gridFeedIn ? "YES" : "NO"); // Netzeinspeisung vorhanden oder nicht

    // PV Produktion größer 3 KW UND Speicher voller als 10% UND wird nicht geladen
    if( PV.currentPower >= pvProduction && STORAGE.chargeLevel >= storageLevel && isCharging == false ) {
        // Es wird nicht geladen und das Laden soll starten
        
        // Überschuss Zyklus Zähler inkrementieren
        pvSurplusTimeCycles = pvSurplusTimeCycles + 1;
        
        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird nicht geladen und das Laden soll starten: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);

        // PV Überschuss sollte stabil über mindestens 2 Zyklen sein um den Ladevorgang zu starten. Verhindert ständiges an und aus schalten der Wallbox
        if( pvSurplusTimeCycles >= cycles ) {
            Shelly.call("Switch.set", {'id': 0, 'on': true}); // Auflader anschalten und damit Starten des Ladens
            isCharging = true;
            noPvSurplusTimeCycles = 0; // Anzahl Zyklen ohne erkanntem PV Überschuss zurücksetzen
            print("----> Laden... Zyklen: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);
        }
    }
    // PV Produktion größer 3 KW UND Speicher voller als 10% UND es wird geladen    
    else if( PV.currentPower >= pvProduction && STORAGE.chargeLevel >= storageLevel && isCharging == true ) {    
        // Es wird geladen und das Laden soll weiter gehen 
                
        pvSurplusTimeCycles = pvSurplusTimeCycles + 1; // Überschuss Zyklus Zähler inkrementieren
        noPvSurplusTimeCycles = 0; // Anzahl Zyklen ohne erkanntem PV Überschuss zurücksetzen
        
        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird geladen und das Laden soll weiter gehen: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);
    }
    // PV Produktion kleiner 3 KW UND es wird geladen
    else if( PV.currentPower < pvProduction && isCharging == true ) {    
        // Es wird geladen und das Laden soll angehalten werden
        
        // Ohne Überschuss Zyklus Zähler inkrementieren        
        noPvSurplusTimeCycles = noPvSurplusTimeCycles + 1;        

        // Debug Ausgabe zur Prüfung der Werte
        print("--> Es wird geladen und das Laden soll angehalten werden: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);

        // Bei mindestens 2 Zyklen ohne Überschuss wird der Ladevorgang angehalten. Verhindert ständiges an und aus schalten der Wallbox
        if( noPvSurplusTimeCycles >= cycles ) {
            Shelly.call("Switch.set", {'id': 0, 'on': false}); // Auflader abschalten und damit Stoppen des Ladens
            isCharging = false;
            pvSurplusTimeCycles = 0; // Anzahl Zyklen mit erkanntem PV Überschuss zurücksetzen
            print("----> Nicht Laden... Zyklen: ", pvSurplusTimeCycles, " | ", noPvSurplusTimeCycles);
        }
    }
    // PV Produktion kleiner 3 KW UND es wird nicht geladen
    else if( PV.currentPower < pvProduction && isCharging == false ) {    
        // Es wird nicht geladen und das soll auch so bleiben
        
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
    // Soll nur am Tag ab 10:00 Uhr bis 21:00 Uhr laufen und ausserhalb abgeschaltet sein
    let curhour = new Date().getHours();
    
    print("===================================================================================");
    print("Prozesszyklus gestartet: ", Date());

    if(!(curhour >= fromHour  && curhour < toHour )) {
        print("Ladezeitruamm noch nicht erreich: ", Date());
        Shelly.call("Switch.set", {'id': 0, 'on': false}); // Auflader abschalten und damit Stoppen des Ladens
        isCharging = false;
        return;
    }

    // Auth. Credentials
    let siteId= "mysiteId";
    let apiFunction = "currentPowerFlow";
    let apiKey = "myapiKey";    

    // URL der SE REST-API    
    let apiUrl = "https://monitoringapi.solaredge.com/site/" + siteId + "/" + apiFunction + ".json?api_key=" + apiKey;

    // HTTP GET-Anfrage senden
    Shelly.call(
        "HTTP.GET",
        {
            url: apiUrl
        },
        function (response, error_code, error_msg) {
            if (error_code === 0) {
                if (response && response.body) {
                    try {
                        // JSON-Dokument parsen
                        let jsonData = JSON.parse(response.body);
                                       
                        // PV Überschuss Prüfung und nach Regeln die Wallbox an oder aus schalten
                        switchChargerByPowerFlow(jsonData.siteCurrentPowerFlow.connections,
                                                 jsonData.siteCurrentPowerFlow.GRID,
                                                 jsonData.siteCurrentPowerFlow.LOAD,
                                                 jsonData.siteCurrentPowerFlow.PV,
                                                 jsonData.siteCurrentPowerFlow.STORAGE);
                    
                    } catch (e) {
                        print("Fehler beim Parsen des JSON:", e, "Antwort:", response.body);
                    }
                } else {
                    print("Keine Antwortdaten (response.body ist undefined).");
                }
            } else {
                print("HTTP-Fehler:", error_code, "Nachricht:", error_msg);
            }
        }
    );
};

Timer.set(
    1000 * 60 * runInterval, // Wiederholung in Millisekunden: Alle 3 Minuten (1000 * 60 * 3)
    true, // Timer wiederholen?
    process // Funktion die in jedem Zyklus aufgerufen wird
);
