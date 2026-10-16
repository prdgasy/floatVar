# Sandstone Template Project

Starter template for creating Minecraft datapacks and resource packs with [Sandstone](https://github.com/sandstone-mc/sandstone).

## Notes

- **Minecraft SNBT supports single-quoted strings** — `'foo'` is valid NBT and parses the same as `"foo"`. Single quotes have been supported in SNBT since 1.13. Don't "fix" generated output that uses single quotes; it's intentional (Sandstone's `JSONTextComponentClass.toString()` emits single-quoted JSON, which is valid NBT).

### Commands must be generated inside an `MCFunction` context

Anything that produces Minecraft commands — `say(...)`, `execute...`, `_.if(...)`, `_.while(...)`, `_.forScore(...)`, `_.switch(...)`, `Objective.create(...)`, `Selector(...)`, etc. — pushes onto the active MCFunction's context stack when it's called. If there's no MCFunction on the stack (i.e. you called the code at the top level of a module, outside any `MCFunction(...)` body or callback), the command has nowhere to go and the build will fail or produce broken output.

**Rule:** any code that may emit commands must only run *inside* an `MCFunction` body, or *inside a JS function/callback that itself only runs from an MCFunction body*. Never call command-producing APIs at the top level of a `.ts` file:

```ts
// ❌ BAD — `say` runs at module top level, no MCFunction context
import { say, MCFunction } from 'sandstone'
say('hi')                     // throws / broken output
MCFunction('hello', () => {
  say('hi')                   // fine
})

// ✅ GOOD — define helper functions that take commands indirectly,
//    then call the helpers from inside MCFunction bodies.
import { _, MCFunction, say } from 'sandstone'

const checkReady = () => {
  _.if(_.entity('@s[tag=ready]')).return()
  say('not ready')
}

MCFunction('tick', checkReady) // callback is run inside the MCFunction
```

The same applies to flow callbacks: `_.if(cond, cb)` is fine because `cb` runs inside the `_.if` body, which is itself created from inside an MCFunction. The point is that the call chain always bottoms out in an `MCFunction(...)` body so the context stack has somewhere to anchor.

Imports of command-producing APIs at the top level are fine — only the *call* has to happen inside an MCFunction.

### Cache & clean rebuilds

- **NEVER delete `.sandstone/`.** Not `.sandstone/output/`, not `.sandstone/cache.json`, not the whole folder. The CLI's incremental build detects source changes via in-memory hashing against `.sandstone/cache.json` and rewrites exactly the files that changed — if you see a stale-looking file after a build, the generator deliberately produced the same bytes. Do NOT clear `.sandstone/` to "force a fresh build"; just re-run `bun dev:build` after editing source. The only legitimate reason to touch `.sandstone/` is when the user explicitly asks for a clean rebuild, and even then the user does it themselves.
- If the build appears to ignore a change you made to source, first verify the change is syntactically valid (build error? type error?) and that you re-ran `bun dev:build` from the template directory. The cache is not the cause.
- **To force a clean rebuild, delete the entire `.sandstone/` folder**, not just `.sandstone/output/`. The `.sandstone/cache.json` tracks resource state across builds; clearing only `output/` leaves stale cache entries that suppress regeneration.

## Commands

```bash
bun dev:build    # Build the pack (outputs to `.sandstone/output/`)
bun dev:build --debug  # Same, but mirror console output to `.sandstone/build-debug.log` (overwritten each run) for targeted inspection
bun dev:watch    # Watch mode - rebuilds on file changes, run this in a background shell and read from `.sandstone/watch.log` rather than your own background shell log
```

**Build logging — keep noise out of your context window.** Always pipe routine builds to `/dev/null`: `bun dev:build > /dev/null 2>&1`. Piping the stdout into a blackhole prevents it from filling your context window, all of the logging goes to the file, do not attempt to do any other piping or the harness will ask the user for permissions all the time. Only use `--debug` (followed by `grep` on `.sandstone/build-debug.log`) when you're actually investigating something specific — don't `cat` the whole file, the log is meant to be searched.

## Project Structure

```
src/
├── index.ts              # Entry point - import your files here
└── *.ts                  # Your datapack code files
sandstone.config.ts       # Pack configuration (name, namespace, formats)
.sandstone/output/        # Generated packs (created on build)
├── datapack/             # Generated datapack
│   ├── pack.mcmeta
│   └── data/
│       ├── <namespace>/  # Your namespace (default: "default", configured in sandstone.config.ts)
│       │   ├── function/*.mcfunction    # Generated MCFunctions
│       │   ├── advancement/*.json       # Advancements
│       │   ├── loot_table/*.json        # Loot tables
│       │   ├── recipe/*.json            # Recipes
│       │   ├── predicate/*.json         # Predicates
│       │   └── tags/<type>/*.json       # Tags (block, item, function, etc.)
│       ├── load/function/_private/      # Lantern Load internals
│       └── minecraft/tags/function/     # Minecraft function tags (load.json, tick.json)
└── resourcepack/         # Generated resource pack (if used)
    ├── pack.mcmeta
    └── assets/<namespace>/
        ├── models/
        ├── textures/
        └── ...
```

**Finding generated files:**
- MCFunctions: `.sandstone/output/datapack/data/<namespace>/function/<name>.mcfunction`
- The namespace is set in `sandstone.config.ts` (defaults to "default")
- Nested function names like `MCFunction('foo/bar', ...)` create `foo/bar.mcfunction`

The `datapack/` folder can be copied directly to `.minecraft/saves/<world>/datapacks/` or linked via config.

## Quick Start

```typescript
import { MCFunction, say, execute, Selector } from 'sandstone'

// Create a function that runs on load
MCFunction('hello', () => {
  say('Hello from Sandstone!')
}, { runOnLoad: true })

// Create a function that runs every tick
MCFunction('tick_loop', () => {
  execute.as(Selector('@a')).run(() => {
    // Commands here run as each player
  })
}, { runOnTick: true })
```

## Documentation

Full documentation: https://sandstone.dev

### Commands
[docs/features/commands.md](https://github.com/sandstone-mc/sandstone-documentation/blob/master/docs/features/commands.md)

Import commands directly: `import { give, effect, execute } from 'sandstone'`
- Subcommands accessed as properties: `effect.give(...)`, `effect.clear(...)`
- Commands with args called as functions: `give('@a', 'minecraft:diamond', 64)`
- Execute uses `.run()` for single commands or `.run(() => {...})` for multiple
```typescript
execute.as('@a').at('@s').run.setblock(rel(0, -1, 0), 'minecraft:dirt')
execute.as('@a').at('@s').run(() => {
  setblock(rel(0, 0, 0), 'minecraft:air')
  say('Hello!')
})
```

### Functions
[docs/features/functions.md](https://github.com/sandstone-mc/sandstone-documentation/blob/master/docs/features/functions.md)

- `MCFunction('name', () => {...})` - Creates a .mcfunction file
- `MCFunction('name', () => {...}, { runOnLoad: true })` - Runs on datapack load
- `MCFunction('name', () => {...}, { runOnTick: true })` - Runs every tick
- `{ lazy: true }` - Only creates file if called from another function
- Inline functions (JS functions) don't create files, commands are inlined

**IMPORTANT: Synchronous Execution**
Everything inside an MCFunction (including all Flow control like `_.if`, `_.while`, `_.forScore`) executes **synchronously within a single game tick**. Minecraft processes all commands instantly - there is no "waiting" between commands. The only way to delay execution across ticks is with `sleep()` in an MCFunction:
```typescript
MCFunction('delayed', () => {
  say('This runs immediately')
  sleep('1s')  // Waits 20 ticks (1 second)
  say('This runs 1 second later')
})
```

**Async Context**: By default, scheduled functions lose entity (`@s`) and position context because `schedule` runs from server context. Use `asyncContext: true` to preserve context:
```typescript
// WITHOUT asyncContext - @s and position are LOST after sleep
const loses_context = MCFunction('loses_context', () => {
  say('Player is @s here')
  sleep('1s')
  say('Now @s is GONE - runs as server!')
})
execute.as('@p').at('@s').run(() => loses_context())

// WITH asyncContext - context is preserved
const keeps_context = MCFunction('keeps_context', () => {
  say('Player is @s here')
  sleep('1s')
  say('Still the same @s and position!')
}, { asyncContext: true })

execute.as('@p').at('@s').run(() => keeps_context())
```
Under the hood, `asyncContext` works by:
1. Adding a **Label tag** to `@s` to mark entities waiting for this sleep
2. Storing **gametime + delay** as a score on `@s`
3. When scheduled time arrives, selecting all entities with that tag whose timer matches current gametime
4. Running the continuation `as` and `at` each matched entity

This elegantly handles multiple entities sleeping simultaneously - each wakes up independently when their timer expires.

### Macros & MCFunction Parameters
[docs/features/macros.md](https://github.com/sandstone-mc/sandstone-documentation/blob/master/docs/features/macros.md)

**Mental model** — `$(name)` is Minecraft's runtime substitution, not JS async. Sandstone compiles `$.give(name, 'diamond', {}, count)` into a command with literal `$(env_0)` / `$(param_0)` tokens, plus emits the dispatch `function <name> with storage <envPath>` at the call site. MC copies storage values into the slots when invoking the mcfunction. The mcfunction file is the same regardless of how many times it's called.

```typescript
const $ = Macro // common alias

const name = Data('storage', 'test', 'Name')

// [envVars], callback receives (_loop, ...params)
const test = MCFunction('test', [name], (_loop: typeof test, count: Score) => {
  // Use variables directly with Macro commands - Sandstone handles the $(name) conversion
  $.give(name, 'minecraft:diamond', {}, count)
})

MCFunction('foo', () => {
  name.set('MulverineX')
  const count = Objective.create('testing')('@s')

  // Call with score param - environment  cannot be overriden
  test(count)
})
```

**You must invoke the thunk to emit the body.** `MCFunction('macro_flow', [x], () => { ... })` creates the function, but the body (`{...}`) only runs when the thunk is called. Without the trailing `()`, visitors see an empty mcfunction and the macro body never serializes:
```typescript
MCFunction('macro_flow', [x], () => {
  $.give(...)
})()   // ← call the thunk to actually emit the body
```

#### Environment Variables vs Parameters
- **Environment variables**: Array as second MCFunction argument `[name]` - cannot be overridden at call time
- **Parameters**: Declared in callback after `_loop`: `(_loop, count: Score)` - passed at call time
- **Usage**: Reference the actual variables in `Macro` commands, not string placeholders

#### `_.with()` — wrap a callback in a macro mcfunction
`_.with([env], cb)` is the convenience form. It lifts `cb`'s body into a child mcfunction (`<parent>/__with_macro`) with each env var registered as `env_N`. Generated output:
```mcfunction
# parent.mcfunction
data modify storage __sandstone:variable foo.env_0 set value 20d
function test:parent/__with_macro with storage __sandstone:variable foo

# parent/__with_macro.mcfunction
$give @s minecraft:diamond 1 $(env_0)
```
The two nesting patterns produce equivalent output — order of `_.with` vs `execute.as/at` doesn't matter:
```typescript
_.with([volume], () => execute.as('@a').at('@s').run(() => $.playsound(...)))
execute.as('@a').at('@s').run(() => _.with([volume], () => $.playsound(...)))
// both → execute as @a at @s run function <__with_macro>; __with_macro has $playsound ... $(env_0)
```

#### Macro Template Literals
Use `Macro` tagged template for dynamic paths:
```typescript
const thing = Data('storage', 'test', 'Thing')
const thingMap = Data('storage', 'test', 'Things')

const test = MCFunction('get_thing', (_loop, index: Score) => {
  // Dynamic array access at runtime
  $.data.storage.modify(thing).set.from.storage(thingMap.currentTarget, $`Things[${index}]`)
})
```

#### Template literals with DataPoints — DON'T
```typescript
say(`got ${entry}`)                       // ❌ serializes as `say got [object Object]`
tellraw('@a', ['got', entry])             // ✅ proper SNBT element-wise serialization
```
DataPoints don't auto-coerce to SNBT inside JS template strings. Use tellraw with an array (or build the `JSONTextComponent` explicitly).

#### Important Limitations
- MCFunctions with macro variables **must** be called at compile-time to register macro names
- Variables used as parameters cannot be used normally within the same function; declare separately if needed
- Nesting not available in parameters; all must be at root level (spread operators work)

### Selectors
[docs/features/selectors.md](https://github.com/sandstone-mc/sandstone-documentation/blob/master/docs/features/selectors.md)

```typescript
import { Selector } from 'sandstone'
Selector('@e', { type: 'minecraft:cow', limit: 1, sort: 'random' })
Selector('@a', { scores: { kills: [10, Infinity] } })  // kills >= 10
Selector('@a', { tag: ['winner', 'alive'] })
```

### Variables & Scores
[docs/features/variables](https://github.com/sandstone-mc/sandstone-documentation/tree/master/docs/features/variables)

```typescript
import { Objective, Selector } from 'sandstone'
const kills = Objective.create('kills', 'playerKillCount')
const myKills = kills('@s')
myKills.add(1)
myKills.set(0)
myKills.greaterThan(10)  // Returns condition for use in _.if()
```

### Data & Data Points
[docs/features/variables/data.md](https://github.com/sandstone-mc/sandstone-documentation/blob/master/docs/features/variables/data.md)

NBT data can be stored in three places: **storage** (virtual), **entities**, or **blocks**. Use `Data` to create references:

```typescript
import { Data, DataVariable } from 'sandstone'

// Create data references (no commands emitted yet)
const pig = Data('entity', '@e[type=pig,limit=1]')
const chest = Data('block', '~ ~ ~')
const myStorage = Data('storage', 'mypack:data')

// Select a path to get a DataPoint
const health = pig.select('Health')
const items = chest.select('Items')
const savedUUID = myStorage.select('player_uuid')

// Shorthand: call Data with path directly
const tags = Data('entity', '@s', 'Tags')
```

**Operations** - All return the data point for chaining:
```typescript
health.set(20)                        // Set value
health.set(otherDataPoint)            // Copy from another data point
health.set(score)                     // Set from score (converted to NBT)
tags.append('marked')                 // Add to end of list
tags.prepend('priority')              // Add to start of list
items.insert({id: 'stone'}, 2)        // Insert at index
item.merge({Unbreakable: NBT.byte(1)}) // Merge NBT without overwriting other fields
tags.remove()                         // Remove this data point
```

**DataVariable** - Anonymous storage for intermediate values:
```typescript
const temp = DataVariable()           // Auto-generated storage path
const named = DataVariable(undefined, 'myVar')  // Named for debugging
const initialized = DataVariable({foo: 'bar'})  // With initial value
const fromScore = DataVariable(myScore)         // Score converted to NBT
```

**getTempStorage** - Shared temporary storage (cleared between uses):
```typescript
const { getTempStorage } = pack
const temp = getTempStorage('uuid')   // Returns __sandstone:temp.uuid
temp.set(someData)                    // Use for intermediate operations
```

**Comparison in conditions**:
```typescript
_.if(health.equals(20), () => { ... })
_.if(tags.equals(['marked']), () => { ... })
```

### Flow Control
[docs/features/flow](https://github.com/sandstone-mc/sandstone-documentation/tree/master/docs/features/flow)

```typescript
import { _ } from 'sandstone'
_.if(myKills.greaterThan(10), () => {
  say('On a rampage!')
}).elseIf(myKills.equalTo(0), () => {
  say('No kills yet')
}).else(() => {
  say('Keep going!')
})
```
- Conditions: score comparisons, `_.data.entity()`, `_.data.block()`, `_.block()`
- Loops: `_.forScore()`, `_.while()`, `_.doWhile()`
- Switch: `_.switch(score, [{case: 0, body: () => {...}}])`

### Coordinates
[docs/features/variables/coordinates.md](https://github.com/sandstone-mc/sandstone-documentation/blob/master/docs/features/variables/coordinates.md)

Commands that accept position arguments require coordinates to be strings, not raw numbers. Use coordinate helper functions:

```typescript
import { absolute, relative, local, setblock } from 'sandstone'

// Absolute coordinates (exact world position)
setblock(absolute(0, 64, 0), 'minecraft:stone')
// Shorthand: abs
import { abs } from 'sandstone'
setblock(abs(0, 64, 0), 'minecraft:stone')

// Relative coordinates (offset from executor position)
setblock(relative(0, -1, 0), 'minecraft:stone')  // One block below executor
setblock(relative(0, 0, 0), 'minecraft:stone')    // At executor position
// Shorthand: rel
import { rel } from 'sandstone'
setblock(rel(0, -1, 0), 'minecraft:stone')

// Local coordinates (relative to executor's rotation)
setblock(local(0, 0, 1), 'minecraft:stone')  // One block in front
// Shorthand: loc
import { loc } from 'sandstone'
setblock(loc(0, 0, 1), 'minecraft:stone')

// Mix absolute and relative
import { VectorClass } from 'sandstone'
const mixedPos = new VectorClass(['0', '~', '~5'])  // x=0 (absolute), y=~ (relative), z=~5 (relative)

// String arrays also work
setblock(['0', '64', '0'], 'minecraft:stone')

// WRONG: Do NOT pass raw number arrays
setblock([0, 64, 0], 'minecraft:stone')  // ❌ Type error - coordinates must be strings!
```

**Key Points:**
- Always use `abs()`, `rel()`, or `loc()` to convert numbers to coordinate strings
- String arrays like `['0', '64', '0']` work but are less readable
- Raw number arrays `[0, 64, 0]` will cause type errors and build failures
- These helpers return `VectorClass` instances that convert to space-separated strings (e.g., `"0 64 0"`)

### NBT Values

When working with NBT data (item components, entity data, block entity data), use `NBT` wrappers for numeric types:

```typescript
import { NBT, ItemPredicate } from 'sandstone'

// ✓ Correct - numbers need NBT wrappers
ItemPredicate('minecraft:diamond_sword').exact('minecraft:damage', NBT.int(0))
ItemPredicate('*').exact('minecraft:max_stack_size', NBT.int(64))

// ✗ Wrong - raw numbers cause type errors
ItemPredicate('minecraft:diamond_sword').exact('minecraft:damage', 0)  // Type error!

// Strings don't need wrapping
ItemPredicate('*').match('minecraft:custom_data', {
  player_name: 'Steve',  // ✓ String is fine as-is
  player_id: NBT.int(123)  // ✓ Number needs NBT.int()
})

// Booleans don't need wrapping
ItemPredicate('*').exact('minecraft:hide_tooltip', {})  // ✓ Empty object for boolean component
```

**NBT Wrapper Rules:**
- **Integers**: Use `NBT.int(value)` for whole numbers (damage, counts, IDs)
- **Floats**: Use `NBT.float(value)` for decimal numbers with less precision
- **Doubles**: Raw numbers work for doubles (no wrapper needed)
- **Strings**: No wrapper needed - use plain strings
- **Booleans**: Use `true` or `false` directly - do NOT use `NBT.byte()`

**Why the wrappers?**
Minecraft's NBT (Named Binary Tag) format distinguishes between different numeric types (byte, short, int, long, float, double). The wrappers ensure your values have the correct NBT type tag.

**SNBT suffix is byte-visible** — wrappers change the literal that ends up in your commands. Raw `11` serializes as `11d` (double); `NBT.float(11)` serializes as `11f`. Same value, different bytes, different downstream behavior (math reads, predicate matches, comparisons).

```typescript
DataVariable(11)               // → ... set value 11d   (raw number → double)
DataVariable(NBT.float(11))    // → ... set value 11f   (explicit float)
DataVariable(NBT.int(11))      // → ... set value 11    (explicit int, no suffix)
```

**Float-typed contexts need `NBT.float` explicitly.** The Math block and any float DataPoint read `Nf` only — a raw `Nd` will be parsed and the result depends on MC's coercion rules, which differ by context. Don't rely on "it looks like a float":

```typescript
// ❌ silent double — math reads as double, downstream ops may misbehave
const d = funnyMath(DataVariable(11))

// ✓ explicit float — SNBT is `11f`, math sees a float
const d = funnyMath(DataVariable(NBT.float(11)))
```

When in doubt, wrap. `NBT.float` and `NBT.int` are zero-cost at build time; raw numbers only differ by being typed differently.

### Resources
[docs/features/resources](https://github.com/sandstone-mc/sandstone-documentation/tree/master/docs/features/resources)

Create datapack resources with type-safe builders:
- `Advancement('name', {...})` - Advancements
- `LootTable('name', {...})` - Loot tables
- `Predicate('name', {...})` - Predicates
- `Recipe('name', {...})` - Recipes
- `Tag('type', 'name', [...])` - Tags (blocks, items, functions, etc.)
- Many more

### Configuration
[docs/features/config.md](https://github.com/sandstone-mc/sandstone-documentation/blob/master/docs/features/config.md)

## Configuration

Edit `sandstone.config.ts` to change:
- `name`: Pack folder name
- `namespace`: Default namespace for resources
- `packs.datapack.packFormat`: Data pack format version
- `packs.resourcepack.packFormat`: Resource pack format version
- `mcmeta`: Minecraft version for type generation (`'latest'` or specific version)
