<img src="assets/icon.svg" width="56" height="56" alt="KanDo Logo">

# KanDo

Deine Aufgaben als Kanban-Board – auf deinem eigenen Server. KanDo verbindet eine reduzierte, deutschsprachige Oberfläche mit einem MCP-Server, über den KI-Clients Aufgaben verwalten können.

**Self-hosted · SQLite · Hell- und Darkmode · MCP · Docker**

KanDo ist eine frühe Version für einen persönlichen Workspace. Es gibt noch keine Benutzerkonten, Teams oder Echtzeit-Synchronisierung. Die Anwendung benötigt Node.js 24 oder neuer bzw. Docker mit Compose; ein Frontend-Build ist nicht nötig.

## Funktionen

- Vier Spalten: Ideenspeicher, Zu erledigen, In Arbeit und Erledigt
- Aufgaben mit Beschreibung, Priorität und optionalem Fälligkeitsdatum
- Drag-and-drop und Statusauswahl für Tastatur und Mobilgeräte
- Suche über Titel und Beschreibung, Prioritätsfilter
- Helle und dunkle Darstellung; standardmäßig Systemeinstellung, manuelle Auswahl wird im Browser gespeichert
- MCP für KI-Clients über Streamable HTTP und stdio

## Lokal starten

```sh
git clone https://github.com/Lauorez/kando.git
cd kando
npm ci
npm start
```

Unter http://localhost:3000 öffnen. `npm start` und `npm run dev` laden eine vorhandene `.env` im Projektverzeichnis; bestehende Umgebungsvariablen haben Vorrang. `npm run dev` startet mit automatischem Server-Neustart.

## Docker

Im geklonten Projektverzeichnis:

```sh
docker compose up -d --build
```

Unter http://localhost:3000 öffnen. Die Daten bleiben im Volume `kando-data` bei Neustarts, Updates und `docker compose down` erhalten. `docker compose down -v` löscht sie.

Die App verwendet einen gemeinsamen persönlichen Workspace ohne Benutzeranmeldung. Der Port ist lokal und in Compose standardmäßig nur an Loopback gebunden. Für entfernten Zugriff einen eigenen Reverse Proxy mit HTTPS und Authentifizierung oder ein privates VPN verwenden. `MCP_TOKEN` schützt nur den MCP-Endpunkt; für die Weboberfläche und REST-API bleibt die vorgeschaltete Authentifizierung nötig.

## MCP anschließen

Der MCP-Server verwendet das [offizielle TypeScript-SDK](https://ts.sdk.modelcontextprotocol.io/server). Beide Zugänge verwenden dieselbe SQLite-Datenbank wie das Board. Änderungen anderer Clients werden über **Aktualisieren**, beim erneuten Fokussieren des Browserfensters oder beim Neuladen sichtbar. Offene Bearbeitungsdialoge bleiben dabei erhalten.

### Streamable HTTP

Der HTTP-MCP läuft mit der App unter:

```text
http://localhost:3000/mcp
```

Diese URL in einem MCP-Client mit Streamable-HTTP-Unterstützung hinterlegen. Der Endpunkt arbeitet zustandslos über POST; ein dauerhafter SSE-Kanal und Sitzungs-IDs werden nicht benötigt.

Optional den Endpunkt mit einem eigenen langen, zufälligen Token schützen:

```sh
MCP_TOKEN='dein-langes-zufaelliges-token' npm start
```

Im Client den Header `Authorization: Bearer dein-langes-zufaelliges-token` setzen. Das ist ein statischer Bearer-Token, kein OAuth-Anmeldeflow. Für Docker die Variablen über eine lokale `.env` setzen; siehe `.env.example`.

Zusätzliche interne Hostnamen lassen sich über `MCP_ALLOWED_HOSTS` erlauben (ohne Schema oder Port). Für einen Tunnel bzw. Reverse Proxy mit öffentlicher HTTPS-Adresse die folgende Konfiguration verwenden. Fremde Browser-Origins werden abgewiesen. Ohne `MCP_TOKEN` ist der lokale Endpunkt für jeden erreichbar, der den lokalen Port erreichen kann.

### Tunnel und Reverse Proxy

`MCP_PUBLIC_URL` enthält die vollständige öffentliche MCP-Adresse. Der Hostname wird automatisch zur Host-Freigabe hinzugefügt. KanDo akzeptiert damit sowohl den ursprünglichen öffentlichen Host-Header als auch einen auf einen freigegebenen lokalen Host umgeschriebenen Header. Die öffentliche HTTPS-Origin wird ebenfalls berücksichtigt. `Forwarded` und `X-Forwarded-*` werden dafür nicht vertraut; ein pauschales Freigeben aller Hosts ist nicht nötig.

1. `.env.example` nach `.env` kopieren und setzen:

   ```dotenv
   MCP_PUBLIC_URL=https://kando.example.org/mcp
   MCP_TOKEN=hier-einen-eigenen-langen-zufaelligen-token-eintragen
   MCP_ALLOWED_HOSTS=localhost,127.0.0.1,[::1]
   ```

   Einen Token kannst du lokal mit `openssl rand -hex 32` erzeugen. Bei gesetzter öffentlicher URL ist ein Token erforderlich; KanDo prüft die Konfiguration vor dem Start. Die URL muss HTTPS verwenden und den Pfad `/mcp` enthalten, ohne Query, Fragment oder Zugangsdaten. Bei einer wechselnden Tunnel-Adresse die URL anpassen und KanDo neu starten.

2. KanDo mit `npm start` oder `docker compose up -d --build` starten. Der Tunnel leitet **nur `/mcp`** auf `http://127.0.0.1:3000/mcp` weiter. HTTPS endet am Tunnel; die Verbindung vom lokalen Tunnel-Prozess zu KanDo verwendet HTTP. `HOST=0.0.0.0` ist nicht erforderlich, wenn der Tunnel auf demselben Rechner läuft.

3. Im MCP-Client **Streamable HTTP**, URL `https://kando.example.org/mcp` und Header `Authorization: Bearer <dein-token>` eintragen. Der Tunnel muss den Authorization-Header unverändert weiterreichen. KanDo verwendet weiterhin einen statischen Bearer-Token und bietet keinen OAuth-Login.

Für einen vorhandenen, lokal verwalteten Cloudflare-Tunnel liegt eine Vorlage unter [`examples/cloudflared.yml`](examples/cloudflared.yml). UUID, Zugangsdatenpfad und Domain durch eigene Werte ersetzen; der Tunnel und dessen DNS-Zuordnung müssen bereits eingerichtet sein. Danach beispielsweise:

```sh
cloudflared tunnel --config /absoluter/pfad/cloudflared.yml ingress validate
cloudflared tunnel --config /absoluter/pfad/cloudflared.yml run
```

Die Vorlage routet ausschließlich `/mcp`; andere Pfade liefern 404. Damit werden Board und REST-API nicht versehentlich über diesen Tunnel veröffentlicht. Aufbau und Pfadregeln entsprechen der [Cloudflare-Dokumentation](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/).

Bei anderen Tunneln oder einem Reverse Proxy dieselbe Pfadbeschränkung konfigurieren. Liefert der Proxy intern etwa `Host: kando:3000`, zusätzlich `kando` in `MCP_ALLOWED_HOSTS` aufnehmen. Läuft der Tunnel in einem eigenen Container, ist `127.0.0.1` dessen eigener Container: dort als Ziel den KanDo-Service im gemeinsamen Docker-Netz verwenden. Die mitgelieferte Vorlage ist für einen Tunnel-Prozess auf dem Host gedacht.

KanDo betreibt den MCP-Endpunkt; den Tunnel betreibst du mit deinem eigenen Anbieter. Die Anwendung startet keinen Tunnel automatisch.

### Lokaler stdio-Zugang

Nach `npm ci` können Clients den MCP als lokalen Prozess starten. Den Beispielpfad durch den absoluten Pfad des geklonten Projekts ersetzen:

```json
{
  "mcpServers": {
    "kando": {
      "command": "node",
      "args": ["/absoluter/pfad/zu/kando/mcp-stdio.js"]
    }
  }
}
```

Die Web-App muss dafür nicht laufen. Beide Prozesse können gleichzeitig auf dieselbe Datenbank zugreifen. Der Standard-Datenpfad liegt relativ zum Projekt, unabhängig vom Arbeitsverzeichnis des Clients. Für andere Datenpfade `DATABASE_PATH` im MCP-Client unter `env` setzen. Bei einer Docker-Installation bevorzugt den HTTP-Zugang verwenden, damit das Docker-Volume verwendet wird.

Manuell starten: `node mcp-stdio.js` oder `npm run --silent mcp`. stdout ist ausschließlich für MCP-Nachrichten reserviert.

### Tools

| Tool | Funktion |
| --- | --- |
| `list_tasks` | Aufgaben lesen; optional `query`, `status` und `priority` |
| `get_task` | Aufgabe mit `id` abrufen |
| `create_task` | Aufgabe erstellen; `title` erforderlich |
| `update_task` | Nur angegebene Felder einer Aufgabe ändern |
| `move_task` | Aufgabe mit `id` in einen `status` verschieben |
| `delete_task` | Aufgabe mit `id` dauerhaft löschen |

Statuswerte: `backlog`, `todo`, `doing`, `done`. Prioritäten: `low`, `medium`, `high`. Neue Aufgaben erhalten standardmäßig `todo` und `medium`. Optional: `description` und `dueDate` im Format `YYYY-MM-DD`; ein leerer Datumswert entfernt das Fälligkeitsdatum. Fehler werden als MCP-Tool-Fehler zurückgegeben. Lesende und löschende Tools sind entsprechend annotiert.

## Konfiguration

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP-Bind-Adresse (im Container `0.0.0.0`) |
| `PORT` | `3000` | HTTP-Port |
| `DATABASE_PATH` | `data/kando.sqlite` im Projekt | Pfad zur SQLite-Datei |
| `MCP_TOKEN` | leer | Bearer-Token für `/mcp`; bei öffentlicher URL erforderlich |
| `MCP_PUBLIC_URL` | leer | Öffentliche HTTPS-MCP-Adresse eines Tunnels/Proxys, inklusive `/mcp` |
| `MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Erlaubte HTTP-MCP-Hostnamen |

## Sicherung

Vor Updates die App und eventuell laufende stdio-Prozesse stoppen. Dann das gesamte Datenverzeichnis bzw. Docker-Volume kopieren; SQLite verwendet WAL. Danach wieder starten. Zum Wiederherstellen bei gestoppten Prozessen den gesicherten Datenordner zurückkopieren.

## Entwicklung

```sh
npm ci
npm run dev
```

Tests ausführen:

```sh
npm test
```

Die Tests verwenden temporäre Datenbanken und prüfen REST-CRUD, Validierung, Speicherung über Neustarts, HTTP- und stdio-MCP mit echten SDK-Clients, gemeinsamen Datenzugriff, MCP-Zugriffsschutz, Tunnel-Weiterleitung und öffentliche URL-Konfiguration sowie Theme-Auswahl und Persistenz. Das Browserlayout und der Docker-Build sind damit nicht visuell bzw. zur Laufzeit geprüft.

Frontend: HTML, CSS und JavaScript. Backend: Node.js HTTP-Server und `node:sqlite`. MCP: `@modelcontextprotocol/sdk` mit Zod-Schemas.


## Feedback

Fehler und Funktionswünsche können über [GitHub Issues](https://github.com/Lauorez/kando/issues) gemeldet werden. Für Fehlerberichte bitte Node.js-Version, Betriebsart (direkt oder Docker) und Schritte zum Reproduzieren angeben. Zugangsdaten und persönliche Aufgaben aus Logs entfernen.
