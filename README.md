# Ascandir - DnD5e Lootplacement

Foundry VTT Modul für **dnd5e 6.x** (getestet gegen Foundry v14.369.1 / dnd5e 6.0.6).

Der SL legt Gegenstände einfach in die Welt – **ohne Tiles**, ohne extra Actor und ohne Drag & Drop (kommt sich so nicht mit anderen Modulen wie Item Piles in die Quere).

## Für den SL: Gegenstände ablegen

1. **Rechtsklick** auf einen Gegenstand – in der Seitenleiste *Gegenstände*, in einem **Kompendium** oder im Inventar eines Charakter-/NSC-Bogens.
2. **„Auf den Boden legen“** wählen. Das Bild des Gegenstands hängt jetzt halb durchsichtig an der Maus.
3. **Linksklick** auf die Karte legt ihn genau dort ab. Weitere Klicks legen weitere ab (praktisch zum Verteilen).
   - **Mausrad** dreht, **Umschalt + Mausrad** dreht fein, **Alt + Mausrad** macht ihn größer/kleiner.
   - **Alt + Linksklick** legt ihn **versteckt** ab (nur der SL sieht ihn; aufdecken per Rechtsklick → Auge).
4. **Rechtsklick** oder **Esc** beendet das Ablegen.

Aus dem Inventar eines Bogens wird der Gegenstand **verschoben** (er verschwindet aus dem Inventar). Aus Seitenleiste und Kompendium wird eine **Kopie** abgelegt. Klickt man zweimal auf dieselbe Stelle, entsteht ein Stapel (z. B. „Pfeil ×40“).

## Liegende Gegenstände bearbeiten (SL)

- **Drehen & Skalieren** – liegenden Gegenstand anklicken (auswählen), dann **Mausrad** zum Drehen (Umschalt = fein) und **Alt + Mausrad** für die Größe. Geht auch mit mehreren gleichzeitig.
- **Eigenes Bild am Boden** – Rechtsklick auf den liegenden Gegenstand → Bild-Symbol links. Dort ein anderes Bild (z. B. mit transparentem Hintergrund) und die Größe einstellen. Beim Aufheben behält das Item sein normales Bild. Mit **„Für alle … merken“** bekommen künftig alle gleichnamigen Gegenstände automatisch dieses Bild und diese Größe – schon in der Vorschau beim Ablegen.
- **Doppelklick** zeigt den Gegenstand als Vorschau.

## Für Spieler: Aufheben

Eigenen Token auswählen und **doppelt auf den Gegenstand klicken** (Token muss direkt daneben stehen). Bei Stapeln wird gefragt, wie viele. Hat der Charakter den Gegenstand schon, wird sein Stapel aufgefüllt. Nicht identifizierte Gegenstände zeigen am Boden nur ihren Tarnnamen.

Ein Spielleiter muss online sein, damit Spieler etwas aufheben können.

## Zusammenspiel mit anderen Modulen

- **Persistent Thrown Weapons/Items:** funktioniert nebeneinander – jedes Modul kümmert sich um seine eigenen liegenden Gegenstände.
- **Item Piles & Co.:** Dieses Modul reagiert nicht auf Drag & Drop, sondern nur auf seinen eigenen Rechtsklick-Eintrag.

## Installation

Manifest-URL in Foundry unter *Module installieren*:

```
https://github.com/Ascandir/Ascandir---DnD5e-Lootplacement/releases/latest/download/module.json
```

## Einstellungen

*Spieleinstellungen → Module konfigurieren → Ascandir - DnD5e Lootplacement*: Reichweite beim Aufheben, Nachfrage bei Stapeln, Standardgröße am Boden, schräges Hinlegen, Drehen/Skalieren per Mausrad (Schrittweiten), Chat-Meldungen.

## Für Makros

```js
game.modules.get("ascandir-dnd5e-lootplacement").api.place("Compendium.dnd5e.items.Item.<id>", { x: 1000, y: 800 }, { quantity: 2, hidden: true, rotation: 30, size: 0.6 });
```
