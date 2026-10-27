# Short product videos of websites: research for a theme's highlight-video pipeline

Researched 2026-10-11. Scope: 25-40 second highlight videos of a Shopify theme, recorded in headless Chrome, no voice, music maybe later.

Labels used below:

- **[Source]** the claim is stated by the linked source. Source quality is noted where it matters (vendor blog, forum, official doc).
- **[Inferred]** my own derivation from one or more sources. The reasoning is given.
- **[Opinion]** taste, from a source that is itself opinion, or mine. Treat as a default to test, not a fact.
- **[Observed]** something I checked directly (a page's markup, a thumbnail, a simulation) on 2026-10-11.

Official sources were thin on numbers for camera moves and pacing. Screen Studio's own docs give no numeric values. The most concrete numbers for zoom and cursor physics came from the source code of Cap, an open-source Screen Studio alternative.

---

## 0. Shopify Theme Store: what the listing actually asks for and shows

### Official rules

- Each listing has three key highlights. "Your first highlight can be a video or a still image." [Source] https://shopify.dev/docs/storefronts/themes/store/review-process/listings
- Purpose: "Use videos to help showcase interactive or animated aspects of the theme preset", or "versatility in theme setup that can't be expressed in screenshots." [Source] same page
- "Don't use video for onboarding or tutorials. Save those for your theme documentation." [Source] same page
- "Recommended length of a video is 2 minutes or less." [Source] same page
- "Don't use the Shopify logo or name in your video." [Source] same page
- "The video must be hosted on YouTube." You provide the `https://www.youtube.com/embed/<id>` URL. You can turn off comments and set it to unlisted. [Source] same page
- Static highlight images are 1600 x 1200 px (4:3), title max 30 characters, description max 140 characters, no animated GIFs. [Source] same page
- "A separate listing form is generated for each preset", and "Each theme preset requires its own individual Theme Store listing page and must be tailored to a specific merchant segment." [Source] same page
- The requirements page has no video rules. [Source] https://shopify.dev/docs/storefronts/themes/store/requirements
- For comparison, the Shopify **App** Store asks for a 2-3 minute video, "promotional rather than instructional", with screencasts limited to 25% of the video. This is for apps, not themes, but it shows what Shopify reviewers consider a good listing video. [Source] https://shopify.dev/docs/apps/launch/app-requirements-checklist

### How the listing page renders the video [Observed]

From the HTML of `https://themes.shopify.com/themes/local/presets/local` on 2026-10-11:

- The highlight card shows YouTube's `hqdefault.jpg` thumbnail (480 x 360) in a **4:3** box (`tw-aspect-[4/3]`, `object-cover`), with a play icon over it. The thumbnail is the first thing a shopper sees, before any frame of the video plays.
- On **mobile**, tapping reveals an inline iframe in a **4:3** box with `autoplay=1&mute=1&controls=1&rel=0`. The video plays **muted** by default.
- On **desktop**, a modal opens with a **16:9** iframe, `md:tw-h-[65vh]`, `autoplay=0`.
- Consequence [Inferred]: a 16:9 video is letterboxed on mobile and in the thumbnail. A 4:3 video is pillarboxed in the desktop modal. Krown Themes (Local) shipped a **4:3** video: its `maxresdefault.jpg` is 1280 x 720 with black side bars. Eight Themes (Envy, Halftone) shipped **16:9** videos with a custom thumbnail, which `hqdefault.jpg` shows letterboxed with black bars top and bottom.

### What top themes do [Observed]

I fetched the preset pages of 23 themes (13 well-known themes plus 10 from the first page of "popular, paid") and looked for a YouTube embed.

| Theme (vendor) | Video | Same video on every preset? |
| --- | --- | --- |
| Envy (Eight Themes) | yes, 16:9, title card "Start with a look." showing all 5 presets side by side, unlisted | yes, all 4 checked presets |
| Halftone (Eight Themes) | yes, 16:9, title card "Pick a style." showing all 5 presets | yes, all 5 presets |
| Local (Krown Themes) | yes, 4:3, feature close-ups of UI on a light grey background | on 4 of 5 presets |
| Broadcast (Invisible Themes) | yes, floating page screenshots on black | only on the Motif preset |
| Dawn (Shopify) | yes, "Introducing Dawn" | single preset |
| Impact, Prestige, Symmetry, Stiletto, Focal, Motion, Palo Alto, Warehouse, Enterprise, Horizon, Beauvoir, Fuse, Majestic, Miro, Motto, Seventh, Sky, Tide | no video | |

- 5 of 23 sampled themes have a video. None of them has a different video per preset. [Observed]
- I could not read video durations: YouTube served a bot check to the fetches.

### Per-product vs per-variant

- Shopify generates one listing per preset and asks each to be "tailored to a specific merchant segment". [Source] listings page above.
- In practice, vendors reuse one theme-wide video across presets, often one that shows all presets together. [Observed]
- No source says the Theme Store ranks or favors listings with a video, or with one video per preset. [Inferred from absence]
- [Inferred] A video per preset fits Shopify's "tailored to a merchant segment" wording better than a shared one. For an automated pipeline the extra cost per preset is small. The shared-video pattern exists because hand-editing several videos is expensive.

---

## 1. Structure and pacing

### Hook

- Google's ABCD guide (5,000+ TrueView ads): "Have more than two frames in the first five seconds", "tightly-framed shots of people or product at the beginning", "Use surprising, unexpected, or delightful images". [Source, correlational] https://services.google.com/fh/files/misc/youtube_google_abcd_reference_guide_en.pdf
- Google's YouTube production guide: "Fast pacing & tight framing. 2+ shots in the first 5 seconds work best". It also says to brighten and use "larger supers" because "most views will appear on dim 5in. screens". [Source] https://services.google.com/fh/files/misc/youtube_ad_production_guide_external.pdf
- Introduce product or brand in the first five seconds (ABCD). Google's 2015 skippable-ads research found that early branding raises recall but also raises skip rate. [Source] ABCD PDF above; https://business.google.com/ca-en/think/marketing-strategies/creating-youtube-ads-that-break-through-in-a-skippable-world/
- [Inferred] Theme Store viewers clicked the video themselves, so skip pressure is lower than for an ad. The hook still matters because mobile autoplays muted and the thumbnail is the first frame they judge.
- Lago, recreating Linear-style launch films with an AI pipeline, lists "no intro card" in its motion grammar. [Source] https://getlago.com/blog/we-killed-our-motion-design-job
- SaaS guides: viewers decide in 3-5 seconds; one template is a 3 s hook, 10 s product reveal, under 60 s total. [Source, vendor blogs] https://supademo.com/blog/demo-video ; https://leadde.ai/blog/how-to-create-a-saas-explainer-video

### Shots and shot length

- TV commercials (1991 study): the average shot lasted under 2 seconds. Camera moves and zooms inside a shot do not count as new shots. [Source, old] https://www.warc.com/Content/421e1376-baa5-472f-aa9d-adc58bea5146
- Screen-demo guidance: 2-4 s per zoom region; feature walkthroughs about 2-3 s per feature. [Source, tool docs] https://mintlify.wiki/siddharthvaddem/openscreen/guides/creating-demos
- A 30 s demo example with about three focused zooms (setup, key action, result); a 45 s example with a 3 s full-screen hook, 4 s on a button, 6 s on a panel; add a visual change about every 10 s on static screens. [Source, vendor] https://www.capcut.com/create/zoom-effects-for-tutorial-videos-guide-attention
- Lago's film is about 23 s. Each shot "must advance at least one story axis"; a shot that advances none is deleted. Their storyboard schema has `readingHold`, `eyeTraceDestination`, `transitionType`, `reviewFrames` per shot, and a validator rejects reading holds that are too short. [Source] getlago.com post above
- "One shot = one idea" and every scene has space to "breathe". [Source, secondary interpretation of Apple] https://youmind.com/zh-CN/landing/x-viral-articles/apple-product-video-framework
- Freelance briefs for premium SaaS launch videos ask for 20-30 s with a hook in the first 2-3 s. [Source, market signal only] https://www.upwork.com/freelance-jobs/apply/High-End-Product-Launch-Video-SaaS_~022047265927952583633/
- [Inferred] UI shots need longer than live-action commercial shots because the viewer has to read. A 30 s video holds roughly 8-14 shots: 2-3 short hook shots of 1-1.5 s, then 5-9 feature shots of 2.5-4 s, then an end card.

### How long to hold a UI state

- Hold text long enough to read it twice at 200 wpm, which is about **0.6 s per word**. [Source] https://www.ssw.com.au/rules/post-production-do-you-give-enough-time-to-read-texts-in-your-videos ; same rule at https://communicationsguide.ucdavis.edu/departments/video/best-practices/accessibility/text-on-screen
- Netflix English subtitles: at most 20 characters per second for adults, at most 42 characters per line, minimum 5/6 s per event, maximum 7 s. [Source] https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide ; https://backlothelp.netflix.com/hc/en-us/articles/215758617
- "Every second text spends moving is roughly a second it can't be read." Glance media gets 1.5-3 s of full attention. [Source] https://www.wirespring.com/pdf/wirespring_2012DSE_contenthowto.pdf
- Even a half-second extra hold can decide between "I saw it" and "I need to replay". Pause motion at least one beat before cutting away from a label. [Source, vendor] CapCut page above
- Lago's example shot: a reading hold of 80 frames inside a 170-frame shot. Frame rate is not stated (2.7 s at 30 fps, 1.3 s at 60 fps). [Source] getlago.com post above

### Total length

- Theme Store: 2 minutes or less recommended. [Source] listings page
- Our 25-40 s target is inside that and close to Lago's 23 s film and the 20-30 s premium SaaS briefs. [Inferred]

### Ending

- Logo end frames in broadcast: Tasmanian Government requires at least 2.5 s for ads of 30 s and longer, 1.5 s for 15 s ads. Ad Council requires 5 s on :20 to :60 spots, 3 s on :10 and :15. [Source] https://www.communications.tas.gov.au/styleguide/p_-_television/30_seconds_and_above ; https://ad-council.brightspotcdn.com/83/c5/3a490c6d4eada61001b5ce8d7100/tv-production-checklist.pdf
- A strong call to action is specific and can be "presented through text cards or simple animation". [Source] ABCD PDF
- Screen Studio has an option to move the cursor back to its start position near the end for a perfect loop. [Source] https://screen.studio/guide/cursor

---

## 2. Camera

### Zoom triggers and levels

- Screen Studio's auto zoom "focuses on the areas where clicks occurred"; with no click it does nothing. [Source] https://screen.studio/guide/auto-zoom
- Cursorful adds an auto zoom when at least 2 clicks happen within 3 s. [Source] https://cursorful.com/welcome
- Cap (open-source Screen Studio alternative) defaults a new zoom segment to **1.5x** (`defaultZoomAmount ?? 1.5`). [Source, code] https://github.com/CapSoftware/Cap/blob/main/apps/desktop/src/routes/editor/Timeline/ZoomTrack.tsx
- Cap's auto zoom groups clicks into clusters with constants `CLUSTER_WIDTH_RATIO 0.5` and `CLUSTER_HEIGHT_RATIO 0.7` (I read the names, not the full logic, so their exact meaning is unverified), and edge-snaps the focus with `edge_snap_ratio 0.25` so the zoomed frame can reach page corners without showing outside the page. [Source, code] https://github.com/CapSoftware/Cap/blob/main/crates/rendering/src/zoom_spring.rs ; https://github.com/CapSoftware/Cap/blob/main/crates/project/src/configuration.rs
- OpenScreen: zoom range 1.25x-5x; subtle emphasis 1.5x-2.2x; detailed UI or code 3.5x-5x. [Source] OpenScreen guide above
- A third-party Screen Studio tutorial: 150% or 200% zoom-ins; subtle keyframed zooms 2-3 s, dramatic ones 1-2 s. [Source, third party, page now 404] cited via search on https://www.temperstack.com/learn/screen-studio/add-zoom-effects/
- Pattern "full screen, cue, zoom, return": show the full UI 1-2 s, point at the target, zoom for the action, pull back before the next step, so viewers do not get lost. A slow push-in of about 8-15% often reads better than a fast punch-in. [Source, vendor] CapCut page above
- Zoom only on a single action or detail; a large zoom area adds little and disorients. [Source, vendor] https://help.walnut.io/help/demos/edit/guides/zoom-effect
- Zooming 2x into 1920 x 1080 output needs a 3840 x 2160 source to stay sharp. [Source] https://docs.pteavstudio.com/en-us/9.0/techniques/kenburns

### Camera physics (springs)

Cap's defaults, from `crates/project/src/configuration.rs` [Source, code]. Settle times are from my simulation of each spring for a unit step (`springs.py` in the scratchpad) [Observed]:

| Spring | stiffness / damping / mass | damping ratio | 95% reached | within 1% | overshoot |
| --- | --- | --- | --- | --- | --- |
| Screen movement (camera pan and zoom) | 200 / 40 / 2.25 | 0.94 | 0.46 s | 0.62 s | ~0% |
| Cursor "Mellow" (default) | 470 / 70 / 3 | 0.93 | 0.34 s | 0.45 s | ~0% |
| Cursor "Smooth" | 80 / 28 / 2.5 | 0.99 | 0.83 s | 1.15 s | 0% |
| Cursor "Fast" | 380 / 30 / 1 | 0.77 | 0.17 s | 0.33 s | 2.1% |
| Click bounce | 530 / 40 / 1 | 0.87 | 0.17 s | 0.21 s | 0.3% |

- Screen Studio uses "Newtonian laws of motion" with Tension, Friction and Mass under Customize, and speed presets Slow / Mellow / Quick / Rapid for cursor and zoom separately. [Source] https://www.screen.studio/guide/animations-motion (fetched via search; the page later returned 404)
- Screen Studio's screen animation modes: "Focused: Animation stabilizes quickly, making it easier to follow and read the content." "Smooth: ... great for more creative content that is not focused on reading." [Source] https://screen.studio/guide/animations
- Apple (WWDC23 "Animate with springs"): springs take duration and bounce; bounce 0 is "a great general purpose spring"; about 0.15 is slightly bouncy, 0.3 noticeably bouncy, above about 0.4 may look exaggerated in UI. Springs keep velocity when retargeted, so interrupted moves stay smooth. [Source] https://wwdcnotes.com/documentation/wwdc23-10158-animate-with-springs/ ; https://developer.apple.com/videos/play/wwdc2023/10158/
- Conversion with mass 1: stiffness = (2π / duration)². The damping formula on Apple's slide is disputed; damping ratio = 1 - bounce (bounce ≥ 0) is the forum derivation. [Source] https://developer.apple.com/forums/thread/739811 . With mass 1 and bounce 0 this gives damping = 4π / duration. My simulation: duration 0.8 s reaches 95% at 0.61 s; duration 1.0 s reaches 95% at 0.76 s. [Observed]
- Remotion `spring()` defaults: mass 1, damping 10, stiffness 100, no overshoot clamping; `durationInFrames` stretches the curve to an exact length; raise damping to remove bounce. [Source] https://www.remotion.dev/docs/spring
- Framer Motion defaults: stiffness 100, damping 10, mass 1; `visualDuration` default 0.25 s, `bounce` 0-1. [Source] https://framer.com/docs/transition/

### Slow push-ins (Ken Burns) on static shots

- Do not over-zoom; some images need no move; start or end on a still for emphasis; vary the move between shots. [Source] https://awstest.wevideo.com/blog/for-work/being-ken-burns-test
- Linear easing gives a steady constant push. [Source] Ken Burns search results, https://www.mintlify.com/francozanardi/movielite/api/vfx/zoom
- [Opinion] For a 2.5-4 s hold, a 3-6% scale drift reads as "alive" without pulling attention from the UI. The 8-15% figure above is for a push-in that is the point of the shot.

### Panning, judder and motion sickness

- RED: "pan no faster than a full image width every seven seconds", based on 24 fps and a 180° shutter. Higher frame rate playback "can reduce judder without having to decrease the panning speed." [Source] https://www.reddigitalcinema.com/red-101/camera-panning-speed
- Rick Gerard (After Effects): move fine detail at whole-number pixels per frame (1 or 2 px/frame); 1.33 px/frame can make a thin line vanish; lower frame rates make the problem more obvious; add as much motion blur as hides it. [Source] https://community.adobe.com/t5/after-effects/avoiding-judder-in-motion-graphics-by-rick-gerard/m-p/11865336
- When the eye tracks an object that stays still in frame, the background can move faster than the 7-second rule. [Source, forum] https://dvinfo.net/forum/archive/index.php/t-514839.html
- WCAG 2.3.3: non-essential motion such as parallax and zooming content onto the screen can trigger vestibular reactions (nausea, migraine). [Source] https://w3c.github.io/wcag/understanding/animation-from-interactions.html ; https://dequeuniversity.com/resources/wcag2.1/2.3.3-animations-from-interactions
- Apple's Reduce Motion guidance lists what to cut back: "zooming, scaling, and peripheral motion", bounce, z-axis depth changes, x/y/z transitions (replace with fades), animating into and out of blurs. [Source] https://developer.apple.com/design/human-interface-guidelines/accessibility
- Apple HIG motion: "Don't add motion for the sake of adding motion. Gratuitous or excessive animation can distract people and may make them feel disconnected or physically uncomfortable." [Source] https://developer.apple.com/design/human-interface-guidelines/motion

### Legibility

- Tight cropping and larger supers make the product clearer on small screens. [Source] Google production guide above
- 28 px is a common minimum for readable text at 1080p; Towbook's video type scale uses 22 px as its smallest legible body size and 28 px captions on a 1920 x 1080 canvas. [Source, mixed quality] https://styleguide.towbook.com/video/typography
- [Inferred] Desktop theme body text is usually 14-16 CSS px. Recorded at 1:1 into a 1920 x 1080 frame and shown in a phone-sized 4:3 box it is far below 28 px, so body copy is unreadable at 1x. Either zoom so readable text reaches about 28 px in the output frame, or treat the shot as layout and not as text.

---

## 3. Cursor and interactions

- Move the cursor deliberately to important elements, pause briefly on key features, avoid rapid movements. [Source, tool docs] OpenScreen guide; https://screenpal.com/blog/screen-recording-tips
- Once the cursor arrives, leave it there or park it in a neutral spot. [Source, vendor] https://goconsensus.com/blog/5-crucial-tips-to-recording-the-best-product-video
- Cap cursor defaults: hide when idle after 2.0 s, rotation while moving 0.15, cursor motion blur 1.0. Click ripple: strength 0.7, size 1.0, duration 0.6 s (range 0.2-1.5 s). [Source, code] Cap configuration.rs
- Screen Studio cursor options: size, hide when idle, "Rotate cursor while moving", "Remove cursor shakes", stop cursor movement at the end, loop back to start position. [Source] https://screen.studio/guide/cursor
- Cursor and click effects help viewers follow the action. [Source, vendor] search summary of OpenScreen and Screenpal docs above

### Typing

- 168,960 participants, 136 M keystrokes: mean 51.56 WPM (SD 20.2); mean inter-key interval 239 ms (SD 112); fast typists about 120 ms with an SD of only 11 ms; keypress duration about 116 ms. [Source] Dhakal et al., CHI 2018, https://www.pokristensson.com/pubs/DhakalEtAlCHI2018.pdf
- Professional typists in older studies: 60-75 WPM with about 140 ms between keys. [Source] same paper, citing Salthouse
- [Inferred] 90-140 ms per character with small random jitter looks like a fluent typist; 239 ms looks like an average one and drags in a 30 s video. Uniform intervals look robotic because real typing varies.

### Cause and effect

- Theme Store: show "interactive or animated aspects of the theme preset". [Source] listings page
- Shopify App Store: promotional, not instructional. [Source] app checklist
- Lago's shot schema pairs `userAction` with `productReaction` and `informationRevealed`. [Source] getlago.com post
- [Inferred] Every click must produce a visible change, and the camera must hold on the change, not on the cursor.

---

## 4. Scrolling and time

- Slow mouse movement and scrolling so the audience watches the content. [Source, vendor] https://screenpal.com/blog/screen-recording-tips
- No source gives a recommended promo scroll speed. A generic autoscroll script defaults to 400 px/s. [Source, not a recommendation] https://greasyfork.org/scripts/456472-website-autoscroll-h
- Tools suggest speeding up loading and navigation 1.5-2x and slowing key interactions to 0.5-0.75x. [Source] OpenScreen guide
- Speed-changed low frame-rate footage skips frames visibly; optical flow helps but is unreliable in Premiere. [Source, forum] https://community.adobe.com/t5/premiere-pro-discussions/time-remapping-ramping-causing-choppy-video/m-p/9282168/highlight/true
- [Inferred] Frame blending ghosts text and cursors; optical flow warps thin text edges. Both are visible on UI. Speed-ups by frame dropping change the apparent speed of the site's own animations, which makes them look wrong to anyone who knows the theme.

### Deterministic capture in headless Chrome

- puppeteer-capture captures frames on demand through the CDP `HeadlessExperimental` domain with a virtual clock; real-time screencast recorders are "not reproducible". It does not support macOS. [Source] https://cdn.jsdelivr.net/npm/puppeteer-capture@1.58.0/README.md
- HeyGen's HTML-to-video write-up: under `beginFrame` control requestAnimationFrame does not fire on its own, so waits on rAF, timers or `fonts.ready` can hang; `--deterministic-mode` drives `performance.now()` from the frame ticks; it works on Linux with chrome-headless-shell and crashes or misbehaves on macOS and Windows; seek clock-owning animation libraries instead of playing them. [Source] https://www.heygen.com/research/html-to-video

### Easing curves

- Linear motion looks wrong because it lacks the timing people expect from physical objects. [Source] Willenskomer, UX in Motion manifesto, https://uxmag.com/articles/creating-usability-with-motion-the-ux-in-motion-manifesto
- Material 3 tokens: standard `cubic-bezier(0.2, 0, 0, 1)`, emphasized-decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)`, emphasized-accelerate `cubic-bezier(0.3, 0, 0.8, 0.15)`, legacy standard `cubic-bezier(0.4, 0, 0.2, 1)`. Durations run from 50 ms (short1) to 1000 ms (extra-long4). [Source, code] https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-motion.scss
- Material (M1): scale duration to travel distance; larger screens need longer durations; entering 225 ms, leaving 195 ms; "Transitions that exceed 400ms may feel too slow." These are for UI responding to a tap, not for a camera in a film. [Source] https://m1.material.io/motion/duration-easing.html
- [Inferred] A video camera move is something the viewer watches, not something they wait for, so it can run 2-3x longer than UI transitions. Cap's camera spring settles in about 0.6 s; manual zooms in tutorials run 1-3 s.

---

## 5. Transitions

- Most transitions should be straight cuts; star wipes and page curls look "very amateurish" when overused. [Source, forum] https://www.dvxuser.com/threads/better-transitions-in-vegas.13359/
- A dissolve signals a change in time or place. Cut first, then soften only the cuts that are too harsh with a short dissolve. [Source] https://riverside.com/video-editor/video-editing-glossary/dissolve ; https://www.rosenblumtv.com/?p=11962
- Long transitions slow the edit and call attention to themselves; if a plain cut works, it is stronger. [Source, vendor] https://josephnilo.com/blog/elevate-your-videos-with-remarkable-transitions-in-movavi/
- Cut on action: cut during movement and the cut feels invisible. Motion to motion feels smooth; motion to still feels abrupt. [Source] https://www.capcut.com/resource/master-the-cutting-on-action ; https://www.musicconnection.com/do-it-yourself-videos/5/
- Murch's Rule of Six ranks eye trace fourth (about 7%): the viewer's eye should land in the same area of the frame after the cut. [Source] https://nofilmschool.com/2016/11/6-rules-good-cutting-according-oscar-winning-editor-walter-murch ; https://artlist.io/blog/eye-trace-and-rule-of-six-editing/
- Lago's Linear-style grammar: "the camera does every transition"; the virtual camera zooms into the action, whip-pans between screens, holds on the payoff; screens "bleed off the frame instead of floating like cards". [Source] getlago.com post
- Whip pan: a 10-frame move (5 before and 5 after the cut, about 0.4 s at 24 fps); motion blur hides the cut; match brightness at the whip points. [Source] https://photofocus.com/software/tutorials-software/easy-whip-swish-pan-in-after-effects/ ; https://nofilmschool.com/how-to-do-a-whip-pan
- Material transition patterns map well to UI shots. Container transform for an element that becomes the next screen (card to product page), shared axis for spatial or navigational relations (next and previous), fade through for unrelated destinations, fade for elements entering or leaving. [Source] https://material.io/design/motion/the-motion-system.html
- Smoothing keyframe graphs and overlapping moves reads more premium than linear motion. [Source, secondary] youmind Apple framework above
- Screen Studio and Cap both apply motion blur to cursor movement, zoom and screen movement. [Source] https://screen.studio/guide/animations ; Cap configuration.rs

---

## 6. Typography and title cards

- Lago: "no intro card". [Source]
- Supers should be larger for mobile; use high contrast and brightness. [Source] Google production guide
- Text on screen: keep it inside the graphics-safe area; hold at least two readings (0.6 s per word); count entrance and exit animation as lost reading time. [Source] SSW, Wirespring above
- Thin fonts disappear on small screens and during fast movement; limit simultaneous animated elements; repeated or looping motion pulls attention from content. [Source, mixed] https://www.videomaker.com/article/c3/18022-typography-for-motion-graphic-design/ ; https://www.digitalsilk.com/web-design/web-trends/kinetic-typography/
- One brand guideline for typography and backgrounds, applied video to video. [Source, secondary on Apple] youmind page
- The Envy and Halftone videos open on a short serif or grotesk title over dark ground with all presets beside it ("Start with a look.", "Pick a style."). [Observed] YouTube maxres thumbnails
- [Opinion] Use the theme's own heading font from the recorded preset for any title card, so the card reads as part of the theme. One family, at most two weights.

---

## 7. Technical delivery

YouTube recommended upload settings [Source] https://support.google.com/youtube/answer/1722171 :

- MP4, moov atom at the front (fast start), no edit lists.
- H.264 High Profile, progressive, CABAC, 4:2:0, variable bitrate, 2 consecutive B-frames, closed GOP of half the frame rate.
- Upload at the frame rate it was made at: 24, 25, 30, 48, 50 or 60 fps.
- SDR bitrates: 1080p 8 Mbps at 24-30 fps, 12 Mbps at 48-60 fps; 1440p 16 / 24 Mbps; 2160p 35-45 / 53-68 Mbps. These are recommendations with no cap.
- Color: BT.709 primaries, transfer and matrix (H.273 value 1).
- Audio: AAC-LC or Opus, 48 kHz (Google's production guide also says AAC-LC at 96 or 48 kHz).
- Standard aspect ratio is 16:9; the player adapts to other ratios. [Source] same page

Other:

- 60 fps is most noticeable on fast uniform motion such as scrolling; record at 60 and you can still publish at 30, not the reverse. [Source, mixed] https://www.obsbot.com/blog/webcam/30fps-vs-60fps ; https://forums.tomsguide.com/threads/recording-in-60fps.383179/latest
- Streaming may play 60 fps uploads at 30 fps for some viewers. [Source, forum] RED search results, dvinfo thread above
- Safe areas (EBU R95): action-safe margin 3.5% per edge (93% of the frame), graphics-safe margin 5% per edge (90%). [Source] https://tech.ebu.ch/publications/r095 ; https://en.wikipedia.org/wiki/Safe_area_(television)
- YouTube embeds overlay controls along the bottom and a title along the top on hover or pause. The Theme Store embed passes `controls=1`. [Observed for the embed parameters; overlay position from common knowledge]
- The Theme Store mobile embed autoplays muted. [Observed] So the video must work with no sound.

---

## Rules for our pipeline

Numbers assume a 1920 x 1080 master at 60 fps unless a rule says otherwise. Each rule names its basis. Rules marked **Decision** need a call from the owner before the pipeline hard-codes them.

### A. Format and delivery

1. **Decision: aspect ratio.** The Theme Store shows a 4:3 thumbnail and a 4:3 muted inline player on mobile, and a 16:9 modal on desktop. Options:
   - **4:3 master (1440 x 1080)**, as Krown's Local video does. Fills the card and the mobile player, pillarboxed in the desktop modal. Recommended, because the card thumbnail and mobile autoplay are seen by more shoppers than the desktop modal, and 4:3 matches the 1600 x 1200 highlight images.
   - 16:9 master (1920 x 1080), as Eight Themes does. Fills the desktop modal and works for YouTube or social reuse, letterboxed on the card and on mobile.
   - Render both from one timeline, upload the 4:3 one to the listing. Costs one more render per video.
2. Encode H.264 High, 4:2:0, BT.709 tagged, MP4 with fast start, closed GOP of 30 frames at 60 fps, 2 B-frames, VBR. Target 20-30 Mbps for 1080p60 screen content; YouTube's 12 Mbps is a floor, not a cap. [Source for format; Opinion for the bitrate above the floor, because sharp text compresses worse than camera footage]
3. 60 fps output. Scroll and cursor motion are the main motion in the video, and 60 fps halves judder against 30 fps. [Source, RED and HFR note]
4. Include a silent AAC-LC 48 kHz stereo track until music exists, so the file has the same layout later. [Opinion]
5. Upload as unlisted, comments off, no "Shopify" text or logo anywhere, including the theme's demo content in frame. [Source, Shopify]
6. Design and upload a custom YouTube thumbnail in the master's aspect ratio. It is the first frame shoppers judge on the listing. Make it the strongest hero frame, not a title card. [Observed for the card; Opinion for the content]

### B. Capture

7. Capture with a virtual clock (CDP `HeadlessExperimental.beginFrame` with deterministic mode, or puppeteer-capture), one frame per 1/60 s of page time, on Linux with chrome-headless-shell. Never use real-time screencast for the final render. [Source, puppeteer-capture and HeyGen]
8. Render the page at `deviceScaleFactor: 2` into a viewport of 1440 x 1080 CSS px (4:3) or 1920 x 1080 CSS px (16:9). The 2x source lets the camera zoom up to 2x without upscaling. [Source for the 2x pixel need; Inferred for the DPR choice]
9. Never time-remap captured frames. No speed-ups, frame blending or optical flow on UI footage. To skip a wait, cut. To show something faster, change the page clock or the scripted action, not the footage. [Inferred from the frame-blending and judder sources]
10. Wait on explicit readiness signals (fonts, images decoded, theme motion finished) rather than on rAF or timers, which do not tick under `beginFrame`. [Source, HeyGen]

### C. Structure and pacing (30 s reference cut)

11. Length 25-40 s, 30 s default. [Source range; Opinion for default]
12. No intro card. Frame one is the theme already in motion: hero content mid-entrance or mid-scroll. [Source, Lago and ABCD "start in the middle of the action"]
13. At least 3 shots in the first 5 s (ABCD says more than two). Hook shots last 1.0-1.6 s each and show the preset's most distinctive visual. [Source]
14. Theme name appears within the first 5 s, integrated into the frame (the store's own header or a short super), not as a separate card. [Source, ABCD branding guidance]
15. Feature shots last 2.5-4.0 s. One shot shows one idea: one interaction or one section. A shot that does not add a new feature, state, or section is deleted. [Source, OpenScreen 2-4 s; Lago story axes]
16. Total about 8-14 shots in 30 s. [Inferred]
17. Hold every settled UI state that carries the shot's point at least 1.2 s after all motion stops (camera, cursor and theme animation). Hold any readable text for max(1.2 s, 0.6 s x words) after it is fully in. [Source, SSW 0.6 s/word; Inferred 1.2 s floor from Netflix 5/6 s minimum plus settle]
18. Each shot's storyboard entry records `focalPoint` (normalized x, y), `readingHold`, `transition`, and the change it shows. A validator rejects a shot whose hold is shorter than rule 17, or whose focal point jumps more than 0.35 of the frame width from the previous shot's across a hard cut. [Source, Lago schema and Murch eye trace; Inferred threshold]
19. End: final settled hero or logo frame held 2.5-3.0 s, with an optional CTA super ("Try it on your store" style, through locales) of at most 5 words. Last 0.5 s is a still frame so the YouTube end overlay does not cover motion. [Source, end-slate minimums; Opinion for wording and still]
20. **Decision: per preset or per theme.** Shopify asks each preset listing to be tailored to a merchant segment; vendors in practice reuse one video across presets. Options:
   - One video per preset, recorded from that preset's demo store. Recommended, because the pipeline makes the extra videos cheap and each listing then shows its own segment.
   - One theme video that shows every preset ("Pick a style." pattern), reused on all listings.
   - Per-preset video that ends with a 3 s strip of all presets. Longest to produce, covers both.

### D. Camera

21. Camera moves are applied to the captured 2x frames in post, driven by a spring, never by linear interpolation. [Source, Willenskomer, Screen Studio, Cap]
22. Camera spring: stiffness 200, damping 40, mass 2.25 (Cap's screen-movement default, damping ratio 0.94, 95% at 0.46 s, settled at 0.62 s). For slow, deliberate moves use Apple-style duration 1.0 s, bounce 0 (stiffness 39.5, damping 12.6, mass 1). Zero overshoot on the camera. [Source, Cap and WWDC23; Observed settle times]
23. Zoom levels: 1.0x for layout shots, 1.4-1.6x for a section or component, 2.0x maximum for a single control or text. Never above 2.0x (source pixel limit from rule 8). [Source, Cap 1.5x default, OpenScreen 1.5-2.2x; Inferred cap]
24. Zoom only toward the shot's focal point. The zoomed region keeps the target inside the middle 50% of frame width and 70% of height, and snaps to the page edge when the target is within 25% of it, so the frame never shows outside the page. [Inferred from Cap's constants, whose exact semantics are unverified]
25. Follow "wide, cue, zoom, return": at least 0.8 s wide before a zoom-in that starts a new area; zoom out before moving to a distant area rather than panning far at 2x. [Source, CapCut pattern; Inferred thresholds]
26. One camera property animates at a time where possible: zoom, then pan, not both with different timings. Never zoom in and out within 1.5 s ("pumping"). [Source, Apple Reduce Motion list; Inferred thresholds]
27. Static holds longer than 2.0 s get a slow drift: scale 1.00 to 1.04 (or translate 1-2% of frame) over the hold, linear or very soft ease. Holds of 2.0 s or less stay still. [Source for Ken Burns restraint; Opinion for numbers]
28. No parallax between page layers created in post, no 3D tilt of the page, no rotation. Screens stay flat and bleed off the frame. [Source, WCAG parallax, Apple z-axis guidance, Lago "bleed off the frame"]
29. Readable text in a shot meant to be read must render at least 28 px tall in the output frame (cap height x zoom x output scale). Otherwise the shot is about layout and gets no text hold. [Source, 28 px floor; Inferred formula]

### E. Cursor and interactions

30. Show a cursor only in shots with an interaction. Hide it after 2.0 s idle, and in pure scroll or layout shots. [Source, Cap default]
31. Cursor path: spring with stiffness 470, damping 70, mass 3 (Cap "Mellow", settled in 0.45 s), along a gently curved path, not a straight line. Max 1 path per 1.0 s. Cursor motion blur on. [Source, Cap; Opinion for curve and rate]
32. Click timing: arrive, then 250-400 ms dwell, then press. Press shows a ripple (0.6 s, strength 0.7) and a cursor scale dip using the click spring (stiffness 530, damping 40, mass 1). [Source, Cap ripple and click spring; Inferred dwell from spring settle plus one beat]
33. After a click, the camera holds on the result, not on the cursor, until the result settles plus rule 17's hold. [Inferred, cause and effect]
34. Typing: 90-140 ms per character with ±25% random jitter, a 200-300 ms pause before the first character, and 400 ms after the last before submit. Typed strings stay short (one search term). [Source, Dhakal fast-typist IKI 120 ms; Inferred jitter and pauses]
35. Hover states get at least 0.6 s of stillness so the theme's hover motion plays fully. [Opinion]

### F. Scrolling

36. Scroll moves are springs between targets, never constant-speed crawls: accelerate, cruise, decelerate, settle, hold. Use the camera spring from rule 22 for the scroll position or an ease of `cubic-bezier(0.65, 0, 0.35, 1)` over the move's duration. [Source, linear motion looks wrong; Opinion for the curve]
37. Peak scroll speed in the output frame: at most 1 frame height per 3 s at 60 fps (about 360 px/s on a 1080 px frame, 6 px per frame). At 2x zoom the page itself moves at half that. Use whole-number pixels per frame for any steady cruise. [Inferred from RED's 7-second rule at 24 fps scaled to 60 fps, and Rick Gerard's whole-pixel rule]
38. A single scroll move covers at most 1.5 viewport heights. Longer travel is a cut, not a scroll. [Opinion]
39. Scroll-triggered theme animations must play in page time during the hold, and the hold starts after they finish. [Inferred]

### G. Transitions

40. Default is a hard cut. Cut on motion where possible: the outgoing shot's camera or scroll is still moving, the incoming one is already moving in the same direction. [Source, cut on action, motion-to-motion]
41. Keep the focal point in roughly the same screen area across a hard cut (rule 18). [Source, Murch]
42. Between related screens, use a camera-driven transition: a whip pan of 0.33-0.40 s (20-24 frames at 60 fps) with directional motion blur, direction matching the page's spatial logic (next section is down, next page is right). [Source, whip-pan frame counts; Lago "camera does every transition"]
43. Card to product page and similar: container-transform continuity, which in capture means recording the theme's own transition (if any) or cutting on the click with the element in the same screen position. [Source, Material container transform; Inferred for capture]
44. Crossfade only for a change of preset or of time, 0.25-0.4 s, at most twice per video. Never a crossfade between two shots of the same page. [Source, dissolve meaning; Opinion for numbers]
45. Banned: star and shape wipes, page curls, spins, 3D cube flips, glitch, zoom-blur punches, any preset transition from an editing pack. [Source, forum consensus; Opinion]
46. Motion blur only on camera moves faster than 1 frame height per second and on whip pans, never on holds. [Inferred]

### H. Text on screen

47. At most 4 supers per video, each at most 6 words, all strings from `locales/`. [Opinion; locales rule from the repo]
48. Font: the recorded preset's heading font, one family, at most two weights. Size at least 56 px on a 1080 px tall frame for supers, 96-140 px for the hook or end title. [Source for "larger supers"; Opinion for sizes]
49. Supers sit inside the graphics-safe area (5% margin per edge) and outside the bottom 12% where YouTube shows controls. [Source, EBU R95; Inferred for the control bar]
50. Super entrance 0.4-0.5 s with emphasized-decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)`, exit 0.25-0.3 s with emphasized-accelerate `cubic-bezier(0.3, 0, 0.8, 0.15)`. Animate opacity plus at most 16 px of translate; no per-letter animation. The reading hold of rule 17 starts after the entrance ends. [Source, Material tokens, Wirespring; Opinion for translate and no per-letter]
51. Text never sits over busy imagery without a scrim; contrast at least 4.5:1. [Opinion, borrowed from WCAG text contrast]

### I. Review gate

52. Render a contact sheet per shot: arrival, settled, interaction, transition midpoint, payoff, end card, as Lago does. A person approves the storyboard and the first render. [Source, Lago]
53. Check the render at 480 x 360 (the listing card size) and in a 4:3 phone-width player, muted. Every shot must still say what it shows. [Observed card size; Source "test on a mobile device"]
