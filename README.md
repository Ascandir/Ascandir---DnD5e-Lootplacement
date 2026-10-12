# Ascandir - DnD5e Lootplacement

Foundry VTT Modul für **dnd5e 6.x** (getestet gegen Foundry v14.368 / dnd5e 6.0.6).

Gegenstände einfach in die Welt legen – **ohne Tiles** und ohne extra Actor:

- **Ablegen (SL)** – einen Gegenstand aus der Seitenleiste, einem Kompendium oder einem Charakterbogen auf die Karte ziehen. Ein kleines Fenster fragt nach der Anzahl und ob er **versteckt** liegen soll (dann sieht ihn nur der SL, aufdecken per Rechtsklick → Auge).
- **Ablegen (Spieler)** – Gegenstand aus dem eigenen Inventar auf die Karte ziehen (höchstens so weit vom eigenen Token wie eingestellt). Er verschwindet aus dem Inventar.
- **Liegen** – der Gegenstand liegt als kleines, leicht schräges Bildchen am Boden. Beim Drüberfahren sieht man den Namen (bei Stapeln mit Anzahl, z. B. „Pfeil ×20“). Nicht identifizierte Gegenstände zeigen nur ihren Tarnnamen.
- **Aufheben** – eigenen Token auswählen und **doppelt auf den Gegenstand klicken** (Token muss direkt daneben stehen). Bei Stapeln wird gefragt, wie viele. Hat der Charakter den Gegenstand schon, wird der Stapel aufgefüllt.
- **Drehen** – liegenden Gegenstand als SL anklicken (auswählen) und am Mausrad drehen. Mit gedrückter Umschalttaste in feinen Schritten.
- **Stapeln** – legt man denselben Gegenstand auf ein Feld, auf dem er schon liegt, wächst der Stapel einfach.
- **SL ohne ausgewählten Token** – Einfachklick zum Verschieben wie gewohnt, Doppelklick zeigt den Gegenstand als Vorschau.

## Zusammenspiel mit anderen Modulen

- **Persistent Thrown Weapons/Items:** funktioniert nebeneinander – jedes Modul kümmert sich um seine eigenen liegenden Gegenstände.
- **Item Piles:** Dieses Modul übernimmt das Ablegen auf der Karte. Soll Item Piles weiterhin normale Drops bekommen, stelle in den Einstellungen eine **Taste beim Ablegen** ein (z. B. Alt) – dann legt dieses Modul nur ab, wenn die Taste gedrückt ist.

Ein Spielleiter muss online sein, damit Gegenstände abgelegt und aufgehoben werden können.

## Installation

Manifest-URL in Foundry unter *Module installieren*:

```
https://github.com/Ascandir/Ascandir---DnD5e-Lootplacement/releases/latest/download/module.json
```

## Einstellungen

*Spieleinstellungen → Module konfigurieren → Ascandir - DnD5e Lootplacement*: Drag & Drop an/aus, Taste beim Ablegen, Spieler dürfen ablegen, Reichweiten, Nachfrage bei Stapeln, Größe am Boden, schräges Hinlegen, Drehen per Mausrad (Schrittweite), Chat-Meldungen.

## Für Makros

```js
game.modules.get("ascandir-dnd5e-lootplacement").api.place("Compendium.dnd5e.items.Item.<id>", { x: 1000, y: 800 }, { quantity: 2, hidden: true });
```
