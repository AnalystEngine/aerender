# aerender

Mock up any visual from a JSON scene, so you can agree it before you build it.

aerender is a command-line tool for AI agents and the people they work with. An agent describes a screen, a social graphic, an A4 page, a diagram or a slide deck as a small JSON scene, and aerender renders it to PNG or PDF. Each change is one or two short commands, so you can revise the mockup until it is right, and only then build the real thing.

![A six-slide deck rendered by aerender](docs/images/deck.jpg)

## Install

You need Node 22 or later and Chrome or Chromium.

```
npm install -g github:AnalystEngine/aerender
aerender doctor
```

`doctor` checks the setup and prints a fix for anything missing. To teach your agent the workflow, install the skill with `npx skills add AnalystEngine/aerender`, or copy `skills/aerender/` into a project's `.claude/skills/`.

## Quick start

```
echo '{"aerender":1,"imports":{"a":"aerender:analystengine/assets"},"children":[]}' > post.scene.json
aerender insert post.scene.json / '{"type":"ref","ref":"a:aSocial","name":"Card"}'
aerender set post.scene.json "Card/Headline" content="Review AI tools before staff adopt them"
aerender tree post.scene.json
aerender render post.scene.json                       # writes renders/card@2x.png
aerender lint post.scene.json --brand analystengine
```

`examples/` has a scene for each kind of visual. Run `aerender --help` for every command.

## Brands

aerender ships two brands: `analystengine` and `example`, a fictional brand built from a short CSS file. `aerender brands` lists every brand it finds, including your own in the directories listed in `AERENDER_BRANDS`.

## Learn more

- [skills/aerender/SKILL.md](skills/aerender/SKILL.md): the workflow, addressing and commands.
- [references/format.md](skills/aerender/references/format.md): the scene format.
- [references/layouts.md](skills/aerender/references/layouts.md): composing screens, graphics, documents, slides and diagrams.
- [references/new-design-system.md](skills/aerender/references/new-design-system.md): building a brand and the brand folder layout.
- [CLAUDE.md](CLAUDE.md): architecture, tests and rules for developers.

## Licence

[Apache License 2.0](LICENSE). It does not cover the AnalystEngine name, logo or other trademarks.
