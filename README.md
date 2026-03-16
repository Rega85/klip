# KLIP — AI Music Video Generator

Generátor celých music video klipů ze Suno písniček. Nahraje MP3 + lyrics → vygeneruje cinematic video pro každou sekci → poslepuje do plného klipu s audiem.

## Jak to funguje

1. **Upload** — MP3 ze Suno + lyrics se sekcemi `[Verse 1]`, `[Chorus]`, `[Bridge]`
2. **Obrázky** — referenční obrázek pro každý typ sekce (první frame videa)
3. **Generování** — Claude vygeneruje cinematic prompty → Replicate generuje clipy paralelně
4. **Export** — FFmpeg (v prohlížeči) spojí clipy + přidá originální audio → stáhni MP4

## Instalace

### 1. Klonuj a nainstaluj

```bash
git clone <your-repo>
cd klip
npm install
```

### 2. API klíče

Zkopíruj `.env.example` → `.env.local` a vyplň:

```bash
cp .env.example .env.local
```

**ANTHROPIC_API_KEY** — https://console.anthropic.com/
**REPLICATE_API_TOKEN** — https://replicate.com/account/api-tokens

### 3. Spusť lokálně

```bash
npm run dev
```

Otevři http://localhost:3000

## Deploy na Vercel

```bash
npm install -g vercel
vercel
```

Nastav environment variables v Vercel dashboardu (Settings → Environment Variables):
- `ANTHROPIC_API_KEY`
- `REPLICATE_API_TOKEN`
- `REPLICATE_VIDEO_MODEL` (volitelné)

## Video modely

Default model: `minimax/video-01` — generuje 6-sekundové clipy z obrázku + promptu.

Alternativy (nastav přes `REPLICATE_VIDEO_MODEL`):
| Model | Qualita | Cena/clip | Rychlost |
|-------|---------|-----------|----------|
| `minimax/video-01` | ⭐⭐⭐⭐ | ~$0.10 | střední |
| `lucataco/kling-v1.6-standard-image-to-video` | ⭐⭐⭐⭐⭐ | ~$0.15 | pomalší |
| `wavespeedai/wan-2.1-i2v-480p` | ⭐⭐⭐ | ~$0.05 | rychlý |

**Pozor:** Různé modely mají různé vstupní parametry. Pokud přepneš model a generování selže, zkontroluj `app/api/start-video/route.ts` a uprav `input` objekt dle dokumentace modelu na Replicate.

## Náklady

Příklad 3minutová píseň:
- ~22 clipů × $0.10 = **~$2.20 za celý klip**
- Anthropic (prompty): ~$0.01

## Struktura projektu

```
klip/
├── app/
│   ├── page.tsx              # Hlavní 4-krokový wizard
│   ├── api/
│   │   ├── generate-prompts/ # Claude → cinematic prompty
│   │   ├── start-video/      # Spustí Replicate prediction
│   │   └── poll/             # Zkontroluje status prediction
├── lib/
│   ├── types.ts              # TypeScript typy
│   └── parse-lyrics.ts       # Parser Suno lyrics + timestamp kalkulace
```

## Formát lyrics

Kopíruj přímo ze Suno — zachovej sekční značky:

```
[Intro]
Instrumentální intro...

[Verse 1]
První řádek sloky
Druhý řádek

[Chorus]
Refrén refrén
Více refrénu

[Bridge]
Přechod do jiné nálady

[Outro]
Závěr...
```

Podporované sekce: `Verse`, `Chorus`, `Bridge`, `Intro`, `Outro`, `Pre-Chorus` + česky `Sloka`, `Refrén`, `Přechod`

## Tipy pro nejlepší výsledky

- **Obrázky:** Použij high-quality obrázky s jasným předmětem. Vyhni se textu v obrázku.
- **Žánr:** Vyplň přesně — Claude přizpůsobí filmový styl (dark pop → tmavé cinematické záběry, folk → přírodní prostředí atd.)
- **Model:** Pro nejlepší kvalitu použij `kling-v1.6` místo `minimax/video-01`
- **Konzistence:** Stejný obrázek pro chorus = konzistentní vizuál refrénu přes celý klip
