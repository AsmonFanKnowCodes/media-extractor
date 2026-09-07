# Project design rules

For all UI work, read and follow `design-system/MASTER.md`. It is the user's approved visual foundation for this extension and future tools. Do not layer an unrelated theme or overrides on top of it.

Keep the app shell branded Media Extractor. Use official, unchanged platform assets inside their corresponding tools; asset provenance lives in `extension/assets/README.md`. YouTube, Instagram, X, Reddit, TikTok and Facebook are implemented. Add further services only when requested and implemented.

Preserve the explicit native-popup width. Validate layout against the actual Brave popup target, including overflow and primary-action visibility, rather than only a tab at a simulated viewport size.
