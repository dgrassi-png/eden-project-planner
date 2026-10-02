# E:DEN Planner — cosa serve per andare online

Il codice delle fasi 00–07 è completo e testato. Lo trovi nel branch
`claude/keen-lovelace-0j4dbh` (PR dgrassi-png/eden-project-planner#9).

Restano solo azioni che richiedono accessi o decisioni di altre persone,
divise per responsabile. L'ordine consigliato è 1 → 2 → 3 → 4, poi 5 e 6
quando possibile.

Regola per tutti i segreti (chiavi, token, secret): non mandarli mai via
chat o email in chiaro. Vanno solo nel file `/etc/eden/planner-<env>.env`
sul server (root, permessi 0600).

---

## 1. Revisione e merge del codice — chi approva le PR del planner

1. Rivedere e unire la PR dgrassi-png/eden-project-planner#9 (CI: `npm ci`, `npm run check`, `npm run build`).
2. Annotare lo SHA del commit unito. Serve al deploy (punto 3).

## 2. E:DEN Identity (auth.e-den.tech) — owner di Identity / `eden-platform`

Il planner accetta accessi solo tramite E:DEN Identity. Oggi Identity non lo
conosce ancora. Le modifiche sono descritte in dettaglio in
`docs/IDENTITY_INTEGRATION.md` §4.

1. Registrare l'applicazione `planner`:
   - aggiungere `"planner": "/sso/planner/"` in `APPLICATION_PATHS`;
   - aggiungere le rotte `GET /sso/planner/` e `POST /api/sso/planner/exchange`, come per Natura, senza il requisito `LEGACY#`;
   - aggiungere gli eventi di audit `PLANNER_SSO_CODE_ISSUED` e `PLANNER_SSO_CODE_CONSUMED`.
2. Impostare `PLANNER_CALLBACK_URL=https://planner.e-den.tech/auth/eden/callback`: esattamente questo URL, niente altro. Va aggiunto anche in `infra/identity-sandbox/application.yaml` e negli script di deploy.
3. Unire il branch `fix/internal-platform-full-access`: il planner ammette gli utenti interni tramite il claim booleano `platform_full_access`.
4. Aggiungere la card e il link `/entry/planner` nel portale account.
5. Aggiungere i test elencati nel §4.4 del documento.
6. Rispondere alle domande del §5, in particolare:
   - il planner è solo per utenti interni oppure anche per esterni con entitlement?
   - si può avere un callback per `planner-preview.e-den.tech`?

Per verificare: `https://auth.e-den.tech/entry/planner` deve rimandare a
`https://planner.e-den.tech/auth/eden/callback?code=…`.

## 3. Server E:DEN (EC2, nginx + systemd) — amministratore del server

La guida completa è `docs/DEPLOYMENT.md`.

1. **DNS.** Creare `planner.e-den.tech` e `planner-preview.e-den.tech`, entrambi verso l'host E:DEN.
2. **TLS e nginx.** Emettere i certificati e aggiungere i due server block da `ops/nginx/planner.conf.example`:
   - produzione → `127.0.0.1:3300`;
   - preview → `127.0.0.1:3310`.

   Poi: `sudo nginx -t && sudo systemctl reload nginx`.
3. **Installare i due ambienti:**
   ```bash
   sudo ops/deploy/install-planner-runtime.sh preview    <url-del-repo>
   sudo ops/deploy/install-planner-runtime.sh production <url-del-repo>
   ```
   Lo script crea la worktree, la cartella dati `/var/lib/eden/planner-<env>`, i backup e l'unit systemd. In produzione installa anche il timer del backup giornaliero.
4. **Compilare `/etc/eden/planner-<env>.env`** (tabella in `docs/DEPLOYMENT.md`):
   - `PLANNER_AUTH_MODE=identity`;
   - `EDEN_IDENTITY_BASE_URL=https://auth.e-den.tech`;
   - `PLANNER_PUBLIC_URL`, con l'hostname del proprio ambiente;
   - `PLANNER_SESSION_SECRET`: generarlo con `openssl rand -base64 48`, diverso per preview e produzione;
   - le variabili Trello e AI del punto 4 quando arrivano.
5. **Rete in uscita.** Consentire HTTPS verso:
   - `auth.e-den.tech`;
   - `api.trello.com`;
   - `api.anthropic.com` e/o `api.openai.com`, solo se si abilita la bozza AI lato server.
6. **Deploy.** Lo script fa automaticamente il backup del database e la migrazione prima di cambiare build:
   ```bash
   ops/deploy/planner-deploy.sh deploy preview <sha-40-caratteri>
   # dopo la verifica della preview:
   ops/deploy/planner-deploy.sh deploy production <sha-40-caratteri> --confirm-production
   ```
7. **Verifiche** (smoke test in `docs/DEPLOYMENT.md`):
   - `/healthz` risponde 200 con l'header `X-Eden-Deploy-Sha` corretto;
   - `/readyz` risponde `"ready":true`;
   - un utente anonimo su `/planner` viene rimandato a Identity;
   - `systemctl list-timers eden-planner-backup-production.timer` mostra il timer attivo.

## 4. Trello — amministratore della board E:DEN

La board di destinazione è `https://trello.com/b/9n93W4ym/eden`. Non creare
un'altra board.

1. **Account per il planner.** Usare un account Trello dedicato (es. "E:DEN Planner"), membro della board con permessi di modifica, così le card risultano create dal planner e non da una persona.
2. **Chiave API e token.** Con quell'account:
   - creare la chiave API dal portale di amministrazione Power-Up di Trello (`https://trello.com/power-ups/admin`);
   - generare un token con permessi `read,write`.
   Consegnarli all'amministratore del server (punto 3), che li inserisce come `TRELLO_API_KEY` e `TRELLO_API_TOKEN`. Poi aggiunge `TRELLO_BOARD_ID=9n93W4ym` e riavvia con un deploy.
3. **Decisioni di mappatura.** Dopo il deploy, dal planner in Settings → Trello:
   - **Stato → lista.** Quale lista corrisponde a Backlog, Ready, In progress, Waiting/blocked, Done, Cancelled? Uno stato senza lista non viene sincronizzato e compare come errore.
   - **Workstream → etichetta.** Quale etichetta usare per GOV, TEC, PROD, SC, CERT, MKT, CRM, EIMA, POST, ROAD? Se mancano, vanno create prima sulla board.
   - **Persone → membri Trello.**
   - **Sottotask.** Come checklist nella card del task padre (default) oppure come card separate?
4. **Primo sync.** Premere "Trello sync…" nel planner, controllare l'anteprima (create / update / invariati / errori) e solo dopo confermare. Ripeterlo non crea duplicati.

Da sapere: il sync va solo dal planner verso Trello. Una data modificata a
mano in Trello non cambia il piano e viene sovrascritta al sync successivo.

## 5. Agenti AI (ChatGPT, Claude) e Personal Assistant — chi configura gli agenti, insieme all'amministratore del server

Gli agenti leggono il piano e inviano proposte. Non possono mai applicarle:
lo fa una persona, dalla pagina Proposals.

1. **Generare un token per agente**, sul server o su un PC fidato:
   ```bash
   node scripts/agent-token.mjs CLAUDE
   node scripts/agent-token.mjs CHATGPT
   node scripts/agent-token.mjs ASSISTANT   # Personal Assistant, sola lettura
   ```
   Ogni comando stampa il token (va mostrato una volta sola, nel secret store dell'agente) e la riga hash. Le righe hash vanno unite con la virgola in `PLANNER_AGENT_TOKENS` nel file env.
2. **Configurare l'agente** (GPT Action, connettore Claude, Personal Assistant) con l'header `Authorization: Bearer <token>` e questi endpoint:
   - `GET /api/projects` per trovare l'id del progetto;
   - `GET /api/projects/<id>/ai-context` per contesto, regole e formato delle proposte;
   - `POST /api/projects/<id>/change-proposals` per inviare una proposta;
   - `GET /api/change-proposals/<id>` per l'esito e il diff;
   - `GET /api/projects/<id>/planning-constraints?owner=<Nome>` per il Personal Assistant.
3. **Facoltativo: bozza AI dal planner** ("Draft with AI" in Proposals):
   - Claude: `ANTHROPIC_API_KEY`; il modello di default è `claude-opus-5-5`, modificabile con `ANTHROPIC_MODEL`;
   - ChatGPT: `OPENAI_API_KEY` più `OPENAI_MODEL` (il modello va scelto esplicitamente).

   Senza queste chiavi il planner funziona lo stesso.
4. `AI_MUTATIONS_REQUIRE_APPROVAL` deve restare `true`.

## 6. Monorepo `simobarre-EDEN/eden-platform` — owner del monorepo

La decisione D-018 è spostare il planner in `frontends/planner`. Da questa
sessione non ho potuto scrivere nel monorepo: la modifica è stata bloccata
per permessi.

1. Dare accesso in scrittura, oppure accettare una PR che copi il planner in `frontends/planner`.
2. Dopo lo spostamento:
   - importare `shared/eden_ui` direttamente, invece della copia in `src/vendor/eden_ui` (oggi TRANSITORIO);
   - aggiungere `planner` ai prodotti di `ops/backup/backup_sqlite.py` e al timer `eden-sqlite-backup@`.

Finché lo spostamento non avviene, il planner può andare online dal suo
repository così com'è.

## 7. Contenuto del piano — Marco e il team

1. Al primo accesso, su un database vuoto, premere "Create E:DEN master plan". Crea le 16 macro-attività (GOV-001 … ROAD-001), senza date, durate o responsabili.
2. In Team, aggiungere le persone (nome ed email).
3. Validare insieme, attività per attività: responsabile, durata, inizio, dipendenze, deadline, priorità, luogo (Cecina / remoto) e splittable. Aggiungere le sottoattività (es. TEC-001.1).
4. Fissare le date delle milestone (EIMA-003 EIMA Bologna, CERT-003 CE) solo quando sono confermate.
5. Da lì in poi:
   - Weekly review ogni settimana;
   - revisione delle proposte AI in Proposals;
   - sync Trello quando il piano cambia.

Il planner non inventa nulla: tutto ciò che non è stato validato resta "TBD"
ed è visibile nella sezione Data quality della Weekly review.
