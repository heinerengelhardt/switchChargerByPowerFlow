# E-Auto Auflader An/Aus Schalter auf SolarEdge PV Anlage mit Monitoring API als Shelly Skript
## Ressourcen
 + Der Auflader ist ein einphasiger Schuko 3kW, 13A Ladeziegel.
 + Das Skript läuft auf einem Shelly Pro EM 50 und schaltet per Schütz eine Steckdose stromführend oder stromlos.
 + Zur Abfrage des PV Ertrags wird die Solar Edge Monitoring API verwendet.

## Grober Ablauf
Das Skript implementiert eine State Machine mit vier Zuständen, die in einem konfigurierbaren Intervall die Monitoring API abfragt und gemäß dem Messergebnis sowie den konfigurierbaren Parametern (Hausverbrauch, Überschuss, Speicherfüllstand) den Auflader an oder aus schaltet.

## Zustandsmodell (State Machine)

```
IDLE  →  PENDING_START  →  CHARGING  →  PENDING_STOP  →  IDLE
              ↓                              ↓
         (zurück zu                     (zurück zu
           IDLE)                         CHARGING)
```

| Zustand | Bedeutung | Lader |
|---|---|---|
| `IDLE` | Warten auf Startbedingungen | AUS |
| `PENDING_START` | Startbedingungen erfüllt, Hysterese-Zyklen sammeln | AUS |
| `CHARGING` | Aktiv laden, Bedingungen überwachen | EIN |
| `PENDING_STOP` | Bedingungen nicht mehr erfüllt, Hysterese-Zyklen sammeln | EIN |

Übergänge zwischen Zuständen erfolgen erst nach einer konfigurierbaren Anzahl stabiler Zyklen (Hysterese), um ständiges An-/Ausschalten zu verhindern. Fallen die Bedingungen während der Hysterese weg, wird zum vorherigen Zustand zurückgekehrt.

## Funktionsbeschreibung
### Wann und wie oft läuft die Funktion?
 + Alle 3 Minuten zwischen 10:00 Uhr und 20:00 Uhr.
 + Außerhalb des Zeitfensters wird der Lader abgeschaltet und der Zustand auf `IDLE` zurückgesetzt.

### Wann startet das Laden? (IDLE → PENDING_START → CHARGING)
 + Die Startbedingungen müssen über 3 aufeinanderfolgende Zyklen stabil erfüllt sein:
    + die aktuelle PV Produktion ist größer oder gleich eines Schwellwerts. Der Schwellwert ist der Ladeleistung des Laders (3 kW) plus durchschnittlicher Hausverbrauch (0.2 kW) gleichgesetzt, also bei 3.2 kW.
    + die aktuelle PV Produktion ist größer als der aktuelle Hausverbrauch.
    + das Delta zwischen der aktuellen PV Produktion und des aktuellen Hausverbrauchs ist größer oder gleich eines Schwellwerts. Der Schwellwert ist der Ladeleistung des Ladeziegels (3 kW) gleichgesetzt. Es soll beim Laden kein Bezug vom Netz oder Speicher stattfinden.
    + der Speicherfüllgrad ist größer oder gleich eines Schwellwerts. Der Schwellwert ist auf 20 Prozent gesetzt.
 + Fallen die Bedingungen während der Hysterese-Zyklen weg, wird sofort auf `IDLE` zurückgesetzt.

### Wann wird weiter geladen? (CHARGING bleibt)
 + Solange mindestens eine der folgenden Bedingungsgruppen erfüllt ist:
    + **Normale Bedingung:** PV Produktion ≥ 3.2 kW und Speicherfüllgrad ≥ 50%.
    + **Abend-Bedingung:** PV Produktion ≥ 2 kW und Speicherfüllgrad ≥ 90%.

### Wann stoppt das Laden? (CHARGING → PENDING_STOP → IDLE)
 + Wenn keine der Weiterladen-Bedingungen mehr erfüllt ist, werden Hysterese-Zyklen gesammelt.
 + Nach 3 aufeinanderfolgenden Zyklen ohne erfüllte Bedingung wird der Lader abgeschaltet.
 + Werden die Bedingungen während der Hysterese wieder erfüllt, wird sofort zu `CHARGING` zurückgekehrt.

## Fehlerbehandlung
 + **API-Fehler:** Nach 3 aufeinanderfolgenden fehlgeschlagenen API-Aufrufen (HTTP-Fehler, leere Antwort, ungültiges JSON, unvollständige Datenstruktur) erfolgt eine Sicherheitsabschaltung des Laders, sofern gerade geladen wird.
 + **Switch-Fehler:** Fehlgeschlagene Schaltbefehle werden geloggt. Bei fehlgeschlagenem Einschalten wird der Zustand auf `PENDING_START` zurückgesetzt, sodass im nächsten Zyklus ein erneuter Versuch stattfindet.
 + **Zeitfenster:** Außerhalb des Ladezeitraums wird der API-Fehlerzähler zurückgesetzt, damit keine veralteten Fehler über Nacht mitgenommen werden.

## Parametrisierung
### API-Credentials (Shelly KVS)
Die SolarEdge API-Credentials werden nicht im Skript-Quellcode hinterlegt, sondern im Shelly Key-Value Store (KVS). Einmalig per Browser einrichten:

```
http://<shelly-ip>/rpc/KVS.Set?key="solarEdgeSiteId"&value="<deine_site_id>"
http://<shelly-ip>/rpc/KVS.Set?key="solarEdgeApiKey"&value="<dein_api_key>"
```

Zur Prüfung ob die Werte gesetzt sind:

```
http://<shelly-ip>/rpc/KVS.GetMany
```

**Hinweis:** Der KVS ist kein echtes Secret-Management. Wer Zugriff auf die Shelly Web-UI oder das lokale Netz hat, kann die Werte über `KVS.GetMany` auslesen. Der Vorteil ist, dass die Credentials nicht im Skript-Quellcode sichtbar sind.

### Schwellwerte
Die globalen Variablen im Skript können nach Bedarf angepasst werden:

| Variable | Standardwert | Beschreibung |
|---|---|---|
| `runInterval` | 3 | Intervall in Minuten |
| `runFromHour` | 10 | Startzeit des Ladezeitraums |
| `runToHour` | 20 | Endzeit des Ladezeitraums |
| `minPvProductionBeforeLoading` | 3.2 kW | PV-Schwellwert zum Starten |
| `minDeltaPvLoad` | 3 kW | Mindest-Differenz PV − Hausverbrauch |
| `minStorageLevelBeforeLoading` | 20% | Speicher-Schwellwert zum Starten |
| `minPvProductionWhileLoading` | 3.2 kW | PV-Schwellwert zum Weiterladen |
| `minStorageLevelWhileLoading` | 50% | Speicher-Schwellwert zum Weiterladen |
| `minPvProductionFinalLoading` | 2 kW | PV-Schwellwert Abend-Bedingung |
| `minStorageLevelFinalLoading` | 90% | Speicher-Schwellwert Abend-Bedingung |
| `targetCycles` | 3 | Hysterese-Zyklen vor Zustandswechsel |
