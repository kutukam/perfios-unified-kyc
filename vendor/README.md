# Why the co-browse SDK is vendored here

`@creditnirvana/cobrowse@0.5.0` on npm draws the highlight ring from
`getBoundingClientRect()` without checking where `position: fixed` actually lands. On an
iPad with the keyboard open the two frames disagree, and the ring is drawn hundreds of
pixels away from the field it is naming — reported from a live demo, ring floating in
blank space above the mobile-number box.

This directory is that same build with the fix (an origin probe in `overlay.ts`), pinned
by path so a clean `npm install` gets it. When the fix ships to npm, delete this directory
and put the released version back in `package.json`.
