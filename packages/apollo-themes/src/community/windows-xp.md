# Windows XP: custom CSS

The [Windows XP theme](windows-xp.ts) sets only the colors. For the full look, pick the theme, then
paste the CSS below into your site's custom CSS (Apollo's **Advanced** section). Your site becomes
an XP window on the blue desktop, the header turns into a title bar, and buttons and cards get the
XP look. It assumes the default page layout (no custom layout).

It also adds XP.css's `window` / `title-bar` / `window-body` classes, so XP.css's window markup
works in your own HTML blocks:

```html
<div class="window">
  <div class="title-bar"><div class="title-bar-text">My Computer</div></div>
  <div class="window-body"><p>Hello from 2001.</p></div>
</div>
```

```css
/*
 * Windows XP look for Apollo. A small version inspired by XP.css
 * (https://botoxparty.github.io/XP.css/), MIT License,
 * Copyright 2020 Adam Hammad, Jordan Scales.
 */
html {
  background: #3a6ea5;
}
body {
  padding: 24px 8px;
  font-family: Tahoma, Verdana, "Segoe UI", sans-serif;
}

/* Your site is a window; the header is its title bar */
.apollo-wrap,
.window {
  background: #ece9d8;
  border-radius: 8px 8px 0 0;
  box-shadow:
    inset -1px -1px #00138c,
    inset 1px 1px #0831d9,
    inset -2px -2px #001ea0,
    inset 2px 2px #166aee,
    inset -3px -3px #003bda,
    inset 3px 3px #0855dd;
  padding: 0 3px 3px;
}
.apollo-wrap {
  padding: 0 3px 16px;
}
.apollo-header,
.title-bar {
  margin: 0 -3px;
  padding: 6px 10px;
  border-radius: 8px 7px 0 0;
  background: linear-gradient(
    180deg,
    #0997ff,
    #0053ee 8%,
    #0050ee 40%,
    #06f 88%,
    #06f 93%,
    #005bff 95%,
    #003dd7 96%,
    #003dd7
  );
  font-family: "Trebuchet MS", Tahoma, sans-serif;
  color: #fff;
  text-shadow: 1px 1px #0f1089;
}
.apollo-site-title,
.apollo-nav a,
.apollo-nav a[aria-current="page"],
.title-bar-text {
  color: #fff;
  font-weight: 700;
}
.apollo-nav a[aria-current="page"] {
  text-decoration: underline;
}
.apollo-wrap > main,
.apollo-footer,
.window-body {
  margin: 0;
  padding: 12px 16px;
}

/* Buttons */
.apollo-button,
.apollo-card-cta,
button {
  background: linear-gradient(180deg, #fff, #ecebe5 86%, #d8d0c4);
  border: 1px solid #003c74;
  border-radius: 3px;
  color: #000;
  font-weight: 400;
}
.apollo-button:hover,
.apollo-card-cta:hover,
button:hover {
  filter: none;
  box-shadow:
    inset -1px 1px #fff0cf,
    inset 1px 2px #fdd889,
    inset -2px 2px #fbc761,
    inset 2px -2px #e5a01a;
}
.apollo-button:active,
button:active {
  background: linear-gradient(180deg, #cdcac3, #e3e3db 8%, #e5e5de 94%, #f2f2f1);
}

/* Cards are group boxes */
.apollo-card {
  border: 1px solid #d0d0bf;
  border-radius: 3px;
}
```

## Why not `@import` XP.css?

Apollo sites can't load stylesheets or fonts from other sites (the page's Content-Security-Policy
blocks them), and the full XP.css is about 256 KB, much more than the 32 KB custom CSS limit. So
this is a hand-picked subset: the window, title bar and button styles. It leaves out XP.css's pixel
fonts, scrollbars, form controls and title-bar buttons.
