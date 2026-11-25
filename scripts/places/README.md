# Bible places and the map outline

`npm run places:build` writes the two data files the map experiment ([#532](https://github.com/AustinKelsay/visibible/issues/532), [Navigation](../../llm/context/NAVIGATION.md)) reads, and `npm run places:today` writes its Today view. All three are generated: rebuild them rather than editing them by hand.

| File | From | Licence |
| --- | --- | --- |
| [src/data/bible-places.json](../../src/data/bible-places.json) | [OpenBible.info Bible Geocoding Data](https://github.com/openbibleinfo/Bible-Geocoding-Data) (`data/ancient.jsonl`, `data/modern.jsonl`) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The map credits it: "Places: OpenBible.info, CC BY 4.0". |
| [src/data/bible-map-outline.json](../../src/data/bible-map-outline.json) | [Natural Earth](https://www.naturalearthdata.com/) 1:10m land, lakes and rivers (`ne_10m_land`, `ne_10m_lakes`, `ne_10m_rivers_lake_centerlines`) | Public domain |
| [src/data/today-map.json](../../src/data/today-map.json) | Natural Earth land boundary lines (`ne_10m_admin_0_boundary_lines_land`), populated places (`ne_10m_populated_places_simple`) and countries (`ne_50m_admin_0_countries`) | Public domain. The map credits it on Today: "Today: Natural Earth". |

## What the build keeps

- **Places.** Every place OpenBible locates and the verses that name it, by USX book code ("EXO 14" → verse → place ids). For each place it keeps the name without OpenBible's disambiguating number ("Migdol 1" becomes "Migdol"), whether OpenBible writes "the" before it, whether it is a region, and up to six proposed modern sites. A site is kept when it lies on the map outline (below), its score is positive and it is at least a tenth of the place's top score. Places with no such site, or named in no verse, are left out.
- **Outline.** The land, lakes and great rivers (Natural Earth scalerank 6 and above, no canals) between 12°W and 80°E and 2°N and 50°N (Spain to India, Ethiopia to the Black Sea). They are clipped to that box, simplified (Douglas–Peucker, about 1.5 km for land), stripped of islands and lakes too small to see, and projected with [bible-map-projection.ts](../../src/lib/bible-map-projection.ts) into relative SVG path data.
- **Today.** Natural Earth's de facto land borders inside the same box, international boundaries in `borders` and disputed, indefinite and other lines in `disputed` (drawn dashed). Countries keep Natural Earth's label point and label rank. Cities keep scalerank 8 and above everywhere, 10 and above in the land (33.5–37°E, 29–34°N), and every capital, sorted by rank with capitals first. Natural Earth has no canals in this data, so the Suez Canal is not drawn.

## Rebuilding

Download both sources first. This script never fetches them.

```bash
git clone --depth 1 https://github.com/openbibleinfo/Bible-Geocoding-Data /tmp/openbible
mkdir -p /tmp/natural-earth && for f in ne_10m_land ne_10m_lakes ne_10m_rivers_lake_centerlines; do
  curl -sSL -o /tmp/natural-earth/$f.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson
done
npm run places:build -- --openbible /tmp/openbible --natural-earth /tmp/natural-earth
for f in ne_10m_admin_0_boundary_lines_land ne_10m_populated_places_simple ne_50m_admin_0_countries; do
  curl -sSL -o /tmp/natural-earth/$f.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson
done
npm run places:today -- --natural-earth /tmp/natural-earth
```

The first build (24 November 2026) kept 1,275 places across 852 chapters. The outline came to about 97 KB. Today's map (25 November 2026) came to about 133 KB: 89 countries and 1,591 cities.
