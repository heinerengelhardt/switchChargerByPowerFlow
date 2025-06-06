# E-Auto Auflader An/Aus Schalter auf SolarEdge PV Anlage mit Monitoring API als Shelly Skript
## Ressourcen
 + Der Auflader ist ein einphasiger Schuko 3kW, 13A Ladeziegel.
 + Das Skript läuft auf einem Shelly Pro EM 50 und schaltet per Schütz eine Steckdose stromführend oder stromlos.
 + Zur Abfrage des PV Ertrags wird die Solar Edge Monitoring API verwendet.

## Grober Ablauf
Das Skript startet einen Timer der in einem konfigurierbarem Intervall läuft, dann die Monitoring API abfragt und gemäß dem Messergebniss sowie den konfigurierbaren Parametern (Hausverbruach, Überschuss, etc.) den Auflader an oder aus schaltet.

## Funkionsbeschreibung
### Wann und wie oft läuft die Funktion?
 + Alle 3 Minuten zwischen 09:00 Uhr und 20:00 Uhr

### Wann startet das Laden bzw. wann wird die Steckdose stromführend geschaltet?
 + Nachdem 3 Zyklen mit folgenden Bedingungen erreicht sind:
    + es wird momentan nicht geladen.
    + die aktuelle PV Produktion ist größer oder gleich eines Schwellwerts. Der Schwellwert ist der Ladeleistung des Laders (3 kW) plus durchschnittlicher Hausverbrauch (0.2 kW) gleichgesetzt, also bei 3.2 kW.
    + die aktuelle PV Produktion ist größer als der aktuelle Hausverbrauch.
    + das Delta zwischen der aktuellen PV Produktion und des aktuellen Hausverbrauchs ist größer oder gleich eines Schwellwerts. Der Schwellwert ist der Ladeleistung des Ladeziegel (3 kW) gleichgesetzt. Es soll beim Laden kein Bezug vom Netz oder Speicher stattfinden.
    + der Speicherfüllgrad ist größer oder gleich eines Schwellwerts. Der Schwellwert ist auf 20 Prozent gesetzt.

### Wann wird weiter geladen, trotz höherem Hausverbruach mal zwischendurch?
 + Bei folgenden Bedingungen:
    + es wird momentan geladen.
    + die aktuelle PV Produktion ist größer oder gleich eines Schwellwerts. Der Schwellwert ist der Ladeleistung des Laders (3 kW) plus durchschnittlicher Hausverbrauch (0.2 kW) gleichgesetzt, also bei 3.2 kW.
    + der Speicherfüllgrad ist größer oder gleich eines Schwellwerts. Der Schwellwert ist auf 50 Prozent gesetzt.
  
### Wann wird weiter geladen, auch gegen Abend wenn die PV Leistung etwas geringer aber Speicher voller ist?
 + Bei folgenden Bedingungen:
    + es wird momentan geladen.
    + die aktuelle PV Produktion ist größer oder gleich eines Schwellwerts. Der Schwellwert ist auf 2 kW gesetzt.
    + der Speicherfüllgrad ist größer oder gleich eines Schwellwerts. Der Schwellwert ist auf 90 Prozent gesetzt.

### Wann stopt das Laden bzw. wann wird die Steckdose stromlos geschaltet?
 + Nachdem 3 Zyklen mit folgenden Bedingungen erreicht sind:
    + es wird momentan geladen.
    + die aktuelle PV Produktion ist kleiner eines Schwellwerts. Der Schwellwert ist der Ladeleistung des Laders (3 kW) plus durchschnittlicher Hausverbrauch (0.2 kW) gleichgesetzt, also bei 3.2 kW.

## Parametrisierung
+ Die Variablen `siteId` und `apiKey` sind für den API Aufruf mit korrekten Werten zu ersetzen.
+ Die globalen Variablen können nach Bedarf angepasst werden.
