# Bible places and the map outline

`npm run places:build` writes the two data files the map experiment ([#532](https://github.com/AustinKelsay/visibible/issues/532), [Navigation](../../llm/context/NAVIGATION.md)) reads. Both are generated: rebuild them rather than editing them by hand.

| File | From | Licence |
| --- | --- | --- |
| [src/data/bible-places.json](../../src/data/bible-places.json) | [OpenBible.info Bible Geocoding Data](https://github.com/openbibleinfo/Bible-Geocoding-Data) (`data/ancient.jsonl`, `data/modern.jsonl`) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The map credits it: "Places: OpenBible.info, CC BY 4.0". |
| [src/data/bible-map-outline.json](../../src/data/bible-map-outline.json) | [Natural Earth](https://www.naturalearthdata.com/) 1:10m land, lakes and rivers (`ne_10m_land`, `ne_10m_lakes`, `ne_10m_rivers_lake_centerlines`) | Public domain |

## What the build keeps

- **Places.** Every place OpenBible locates and the verses that name it, by USX book code ("EXO 14" → verse → place ids). For each place it keeps the name without OpenBible's disambiguating number ("Migdol 1" becomes "Migdol"), whether OpenBible writes "the" before it, whether it is a region, and up to six proposed modern sites. A site is kept when it lies on the map outline (below), its score is positive and it is at least a tenth of the place's top score. Places with no such site, or named in no verse, are left out.
- **Outline.** The land, lakes and great rivers (Natural Earth scalerank 6 and above, no canals) between 12°W and 80°E and 2°N and 50°N (Spain to India, Ethiopia to the Black Sea). They are clipped to that box, simplified (Douglas–Peucker, about 1.5 km for land), stripped of islands and lakes too small to see, and projected with [bible-map-projection.ts](../../src/lib/bible-map-projection.ts) into relative SVG path data.

## Rebuilding

Download both sources first. This script never fetches them.

```bash
git clone --depth 1 https://github.com/openbibleinfo/Bible-Geocoding-Data /tmp/openbible
mkdir -p /tmp/natural-earth && for f in ne_10m_land ne_10m_lakes ne_10m_rivers_lake_centerlines; do
  curl -sSL -o /tmp/natural-earth/$f.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson
done
npm run places:build -- --openbible /tmp/openbible --natural-earth /tmp/natural-earth
```

The first build (24 November 2026) kept 1,275 places across 852 chapters. The outline came to about 97 KB.
