# Local icon assets

The base icon sets are downloaded SVG images, loaded directly from this project. No icon CDN or runtime icon library is required.

## Lucide

Source: https://github.com/lucide-icons/lucide/tree/main/icons
Website: https://lucide.dev/
License: ISC, with inherited Feather notices. The original license is in `lucide/LICENSE`.
Downloaded on 2026-10-04. SVG files are unmodified; CSS adjusts their display size and contrast for each theme.

## Meteocons

Author: Bas Milius
Source: https://github.com/basmilius/meteocons
Distribution: https://unpkg.com/@meteocons/svg-static@0.1.0/fill/
License: MIT, included in `meteocons/LICENSE`.
Downloaded on 2026-10-04. These are unmodified static SVGs and do not animate.


## Pixelarticons

The main weather panel uses local pixel icons from [Pixelarticons](https://github.com/halfmage/pixelarticons), by Gerrit Halfmann, under the MIT license. Downloaded 2026-10-04 from revision `8275e0af7c16aa40c54ea2b90b7af83b1fe4eb4c`, `svg/`. Original SVG files are stored without modification in `pixelarticons/`; color is applied using CSS. The license is included in that folder. The weather states use distinct local assets: clear day/night, partial clouds day/night, overcast, drizzle, rain, thunderstorms, snow, and fog. Navigation also uses the local sun, book-open, and circle-info icons; Auto uses reload.

Meteocons files remain available in the project but are no longer used by the main weather panel.

## Weather variants

`weather/cloud-drizzle.svg`, `weather/cloud-rain.svg`, and `weather/cloud-storm.svg` are local adaptations of the MIT-licensed Pixelarticons cloud above, with pixel precipitation or lightning added. `weather/fog.svg` is an original matching vector made of horizontal pixel bands. These additions are SVG assets, loaded locally, with no runtime drawing or external dependency. Clear/partly cloudy day and night variants follow actual Bandung daylight, independently of the selected page theme. The upstream notice remains in `pixelarticons/LICENSE`.
