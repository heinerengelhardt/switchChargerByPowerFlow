# E-Auto Auflader An/Aus Schalter auf SolarEdge PV Anlage mit Monitoring API als Shelly Skript
 + Der Auflader ist ein einphasiger Schuko 3kW, 13A Ladeziegel.
 + Das Skript läuft auf einem Shelly Pro EM 50 und schaltet per Schütz eine Steckdose stromführend oder stromlos.
 + Zur Abfrage des PV Ertrags wird die Solar Edge Monitoring API verwendet. Die Variablen `siteId` und `apiKey` sind für den API Aufruf natürlich zu ersetzen.

Grober Ablauf: Das Skript startet einen Timer der in einem konfigurierbarem Intervall läuft, dann die Monitoring API abfragt und gemäß dem Messergebniss sowie den konfigurierbaren Parametern den Auflader an oder aus schaltet.
