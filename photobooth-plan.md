# 📸 Mini photobooth thermique 58mm (EM5820 + ESP32) — Spec & plan de dev (Laravel-first)

## Objectif
Créer un petit appareil “photobooth” qui permet :
- de **prendre une photo depuis une web-app mobile** (PWA),
- de **l’envoyer au backend Laravel** (stockage + UI),
- de **créer un job d’impression**,
- et de laisser un **ESP32 (connecté au Wi-Fi) récupérer les jobs** depuis Laravel pour imprimer via une **imprimante thermique 58mm** (type ESC/POS sur UART TTL).

Contraintes confirmées :
- ❌ Aucun envoi direct du navigateur vers l’ESP32.
- ✅ Tout passe par Laravel (upload, stockage, file de jobs, statut, galerie).

---

## Faisabilité technique

### Impression thermique “photo”
Oui, c’est faisable, avec les points d’attention suivants :
- **Thermique = 1 bit/pixel (noir/blanc)** : il faut convertir la photo en noir/blanc avec **dithering** (Floyd–Steinberg ou Bayer) pour un rendu “nuances de gris” crédible.
- **Largeur imprimable** : sur la plupart des 58mm (203 dpi), on est souvent autour de **384 dots** de large (à confirmer sur ton modèle exact).
- **Alimentation** : l’impression d’images consomme beaucoup (pics de courant). Prévoir une alim/batterie stable et suffisante + câblage propre.
- **Transport des jobs** : le plus robuste est que **l’ESP32 initie une connexion sortante** (WebSocket/MQTT) vers le backend → pas de NAT à gérer.

### Spécifications matérielles confirmées (EM5820)
- Résolution : `203 dpi — 384 dots/line`
- Largeur d'impression : `48 mm`
- Vitesse d'impression : `60 mm/s`
- Baud rate : `9600 (default)`
- Commande d'impression : `ESC/POS`
- Codes-barres supportés :
  - 1D : `Codabar, Code39, Code93, Code128, EAN13, ITF25, UPC-A, UPC-E`
  - 2D : `QR`
- Papier : `papier thermique 58 mm, épaisseur 0.05–0.1 mm, diamètre rouleau ≤ 40 mm`
- Interfaces : `USB / RS232 / TTL (3-in-1)`

---

## Architecture globale (V1 “propre”)

```text
[Smartphone PWA] --HTTPS--> [Laravel API + UI] --> [DB + Storage]
                                       |
                                       |  (WebSocket/MQTT/Polling)
                                       v
                                 [ESP32 Device]
                                       |
                                       | (UART TTL / ESC-POS)
                                       v
                           [Imprimante thermique 58mm]
```

### Architecture retenue (V1)

- Laravel convertit les images en fichiers binaires ESC/POS (.bin) prêts à l’impression.
- L’ESP32 reçoit les jobs via WebSocket (WSS) en temps réel.
- L’ESP32 télécharge le fichier `.bin` et le stream directement sur UART vers l’imprimante.
- L’ESP32 envoie les ACK et statuts via WebSocket.

---

## Workflow utilisateur
1. L’utilisateur ouvre la web-app (PWA)
2. Il prend une photo (caméra) + preview
3. Il “envoie” la photo → Laravel la stocke
4. Laravel crée un print job (statut: pending)
5. L’ESP32 récupère le job (push via WS/MQTT ou polling)
6. L’ESP32 télécharge l’image, la convertit (ou reçoit un bitmap prêt)
7. L’ESP32 imprime via ESC/POS sur UART
8. L’ESP32 envoie un ACK (succès/erreur) → Laravel met à jour le job

---

## Décisions clés (à trancher tôt)

### A) Où se fait la conversion image → bitmap ESC/POS ?

#### Option 2 — Conversion côté Laravel (Décision actée)
- L’ESP32 ne traite pas les images.
- Laravel génère les fichiers binaires ESC/POS prêts à être imprimés.
- Cela simplifie le firmware ESP32, qui se contente de streamer les données reçues.
- Permet un contrôle précis et une meilleure performance côté backend.

### B) Comment l’ESP32 reçoit les jobs ?

- WebSocket (WSS) dès la V1 (Décision actée) : push temps réel, communication bidirectionnelle, plus réactif.
- Polling HTTP peut être utilisé en fallback ou dépannage, mais n’est plus la méthode principale.

---

## Backend Laravel — Modèle de données

### devices
- id (uuid ou int)
- name
- api_token_hash
- last_seen_at
- meta (json: firmware_version, rssi, etc.)

### photos
- id
- user_id (optionnel si auth)
- path_original (storage)
- path_preview (optionnel)
- width, height
- created_at

### print_jobs
- id
- device_id
- photo_id (nullable si QR-only)
- type (photo, qrcode, text)
- options (json: crop, rotate, dither, density)
- status (pending, processing, printed, failed, canceled)
- error_message (nullable)
- printed_at (nullable)
- created_at

---

## Backend Laravel — API (proposition)

### Auth device
- Chaque device a un token (header Authorization: Bearer <token>).
- Token stocké hashé (api_token_hash) côté DB.

### API UI (PWA)

Upload photo  
`POST /api/photos`
- multipart: photo
- response: { id, url, thumb_url }

Créer un job d’impression  
`POST /api/devices/{deviceId}/print-jobs`  
Body:
```json
{
  "type": "photo",
  "photo_id": 123,
  "options": {
    "mode": "photo",
    "dither": "floyd",
    "rotate": 0,
    "crop": "center",
    "caption": "Soirée 13/01"
  }
}
```

Galerie  
`GET /api/photos?printed=1`  
`GET /api/photos/{id}`

Réimprimer  
`POST /api/print-jobs/{id}/reprint`

---

## API Device (ESP32)

Récupérer le prochain job (WebSocket)  
`GET /api/device/jobs/next`  
Headers: Authorization: Bearer <token>  
Response (ex):
```json
{
  "job": {
    "id": 78,
    "type": "photo",
    "escpos_url": "https://app.tld/storage/escpos/abc.bin",
    "options": { "dither": "floyd", "mode": "photo" }
  }
}
```

Si aucun job:  
```json
{ "job": null }
```

ACK / statut

`POST /api/device/jobs/{jobId}/ack`  
Body:
```json
{ "status": "printed", "meta": { "duration_ms": 4200 } }
```

ou

```json
{ "status": "failed", "error": "PRINTER_TIMEOUT" }
```

Heartbeat

`POST /api/device/heartbeat`  
Body:
```json
{
  "rssi": -55,
  "ip": "192.168.1.20",
  "firmware": "1.0.3",
  "printer": { "online": true }
}
```

---

## UI Laravel (admin simple)

- **Devices**
  - état online/offline (last_seen_at)
  - bouton “imprimer QR de pairing”

- **Print Jobs**
  - liste des jobs, statut, erreurs, logs
  - bouton “retry”

- **Galerie**
  - miniatures des photos imprimées
  - bouton “réimprimer”

---

## ESP32 — Firmware (étapes)

### Étape 1 — Print texte (bring-up)

Objectif : confirmer câblage, baud rate, commandes basiques.
- UART TTL
- Baud rate 9600
- Test commande reset ESC/POS
- “Hello”
- line feeds
- align center
- impression d’un QR vers l’URL du site

### Étape 2 — Téléchargement et impression du fichier binaire ESC/POS

Objectif : valider réception et streaming du binaire ESC/POS.
- Connexion WebSocket (WSS) au backend
- Récupération du job et téléchargement du fichier `.bin`
- Stream direct sur UART vers imprimante
- Gestion des erreurs d’impression

### Étape 3 — Intégration réseau + jobs (WebSocket)

Objectif : l’ESP32 reçoit les jobs en temps réel.
- Maintien de la connexion WebSocket
- Réception push des jobs
- Téléchargement et impression
- Envoi d’ACK via WebSocket

### Étape 4 — Bouton physique
- appui court : imprime “QR du site”
- appui long : reprint dernier job (option) / mode setup Wi-Fi (option)

---

### Conversion image (photo -> imprimable)

Cible
- largeur = W pixels (souvent 384)
- hauteur variable
- 1 bit/pixel (packed)

Pipeline recommandé (photo)  
1. Decode JPEG/PNG  
2. Resize à largeur W (conserver ratio)  
3. Convert grayscale  
4. Ajuster contraste/gamma (optionnel)  
5. Dithering (Floyd–Steinberg recommandé)  
6. Pack bits + ESC/POS raster send

Options utiles
- mode=photo: dither + contraste
- mode=logo: threshold simple + pas de dither
- rotate=90/180/270
- invert=true (selon papier)

**Cette section s’exécute exclusivement côté Laravel.**

---

## Connexions matérielles

| ESP32 Pin | Printer Pin        | Notes               |
|-----------|--------------------|---------------------|
| TX        | RX (TTL)           | Obligatoire         |
| RX        | TX (optionnel)     | Pour retour état    |
| GND       | GND                | Obligatoire         |

**Attention :** Ne jamais alimenter l’imprimante depuis le pin 5V de l’ESP32.

---

## Alimentation & puissance

- Tensions supportées : `5–9 V (12 V optionnel)`
- Recommandation : utiliser uniquement `5 V` ou `9 V` pour projets ESP32 (éviter 12 V sauf si nécessaire pour la carte)
- Courants requis :
  - Idle : environ `200–300 mA`
  - Impression texte : pics de `0.8–1 A`
  - Impression image : pics jusqu’à `~2 A`
- Recommandations fortes :
  - Rail d’alimentation séparé pour l’imprimante
  - Masse commune entre ESP32 et imprimante
  - Condensateurs de découplage (≥ 1000 µF) proches de l’entrée d’alimentation de l’imprimante

---

## Provisioning Wi-Fi (V2 portable)

### Objectif : emmener l’appareil n’importe où.
Deux patterns :
- BLE provisioning (confort)
- SoftAP + captive portal (simple)

Dans les 2 cas, l’ESP32 se connecte ensuite au backend via connexion sortante :
- WebSocket (WSS) ou MQTT over TLS

---

## Sécurité
- Tout en HTTPS côté UI.
- Device auth par token.
- Rate limit côté API device (anti spam).
- Taille max upload image + validation mime.
- Option pairing :
  - au premier démarrage, l’ESP32 imprime un QR “pairing code”
  - l’admin scan et associe device ↔ compte/événement

---

## Features à envisager (sympas)

### Rendu / expérience
- “strip photomaton” : 3 petites photos en colonne sur un ticket
- ajout timestamp + nom d’événement
- QR imprimé vers la photo dans la galerie (partage)

### Soirée / multi-utilisateurs
- file d’attente visible
- mode “moderation” (valider avant impression)
- PIN/QR temporaire (anti abus)

### Device
- LED status (wifi, printing, error)
- batterie + niveau
- logs simplifiés (dernier code erreur)

---

## Checklist MVP (ordre conseillé)
- ESP32 imprime texte + QR (local)
- ESP32 télécharge et imprime fichier binaire ESC/POS
- Laravel: upload photo + stockage + galerie simple
- Laravel: création de print job + endpoint device jobs/next via WebSocket
- ESP32: WebSocket + download + print + ack
- UI: capture photo mobile + envoi + feedback “dans la file”
- Admin: page jobs + retry + erreurs

---

## Notes pratiques
- Beaucoup de bugs initiaux viennent de : baud rate, alimentation insuffisante, masses mal communes.
- Pour un rendu photo propre : dithering est quasi obligatoire.
- Utiliser WebSocket dès la V1 simplifie la communication et la réactivité.

---

## Références (liens Markdown)
- [ESC/POS (commande raw / concept)](https://www.neodynamic.com/articles/How-to-print-raw-ESC-POS-commands-from-PHP-directly-to-the-client-printer) : Neodynamic — ESC/POS raw commands
- [ESP32 + thermal printer overview (hardware/principes)](https://www.digikey.com/en/maker/projects/understanding-thermal-printers-and-how-to-use-it-with-esp32/40c0cb1780f043bb9e6b5bb40466a4ed) : Digi-Key Maker — Thermal printers with ESP32
- [Impression d’images en ESC/POS (raster / commandes)](https://new-grumpy-mentat.blogspot.com/2014/06/java-escpos-image-printing.html) : Java ESC/POS image printing notes
- [Exemple imprimante 58mm RS232/TTL compatible ESC/POS (produit)](https://french.alibaba.com/product-detail/Mini-58mm-Panel-Embedded-Thermal-Printer-62582847103.html) : Alibaba — 58mm embedded thermal printer (RS232/TTL)
