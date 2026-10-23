# Deskbox 🚀

Un'alternativa moderna, ultra-leggera e personalizzabile a Rambox per Ubuntu.
Raggruppa in un'unica interfaccia snella **Gmail**, **Google Calendar**, **WhatsApp Web** e **Telegram Web**.

## 🌟 Caratteristiche principali

- **Barra Laterale Dinamica**: Passa rapidamente da un servizio all'altro con clic o scorciatoie da tastiera (`Ctrl+1`, `Ctrl+2`, `Ctrl+3`, `Ctrl+4`).
- **Sistema di Notifiche e Badge**: Rilevamento in tempo reale dei messaggi non letti con contatore visivo su ciascuna icona e totale sul vassoio di sistema.
- **System Tray (Area di Notifica)**: L'app rimane attiva in background alla chiusura della finestra con conteggio globale dei messaggi non letti.
- **Sessione Condivisa & Google Login Bridge**: Grazie al Google Login Bridge integrato, puoi accedere con un clic tramite una finestra autentica di Google Chrome; i cookie di sessione vengono sincronizzati automaticamente in Deskbox eliminando alla radice l'errore "browser non sicuro".
- **Protezione User-Agent**: Bypass dei blocchi di sicurezza di WhatsApp Web e Telegram Web.
- **Link Esterni Sicuri**: Cliccando su link esterni nelle chat o nelle email, questi si aprono automaticamente nel tuo browser predefinito di Ubuntu (Chrome/Firefox).
- **Permessi Multimediali Abilitati**: Supporto a note vocali WhatsApp/Telegram e microfono.

---

## 🚀 Avvio Rapido

### Dal menu Applicazioni di Ubuntu
Premi il tasto **Super (Windows)**, cerca **Deskbox** e clicca sull'icona.

### Dal terminale
```bash
/home/marco/.gemini/antigravity-cli/scratch/deskbox/scripts/run.sh
```

oppure:
```bash
cd /home/marco/.gemini/antigravity-cli/scratch/deskbox
npm start
```

---

## ⚙️ Aggiungere o Modificare Servizi

I servizi sono configurati nel file [`services.json`](services.json). Puoi modificare o aggiungere nuovi servizi semplicemente inserendo un nuovo oggetto JSON:

```json
{
  "id": "slack",
  "name": "Slack",
  "url": "https://app.slack.com/client",
  "icon": "assets/slack.svg",
  "partition": "persist:shared",
  "badgeType": "title-or-dom"
}
```

---

## ⌨️ Scorciatoie da tastiera

| Scorciatoia | Azione |
| :--- | :--- |
| `Ctrl + 1` | Passa a Gmail |
| `Ctrl + 2` | Passa a Google Calendar |
| `Ctrl + 3` | Passa a WhatsApp |
| `Ctrl + 4` | Passa a Telegram |
| `Ctrl + G` | Accedi con Google Chrome (Sync automatico) |
| `Ctrl + R` | Ricarica il servizio attivo |
