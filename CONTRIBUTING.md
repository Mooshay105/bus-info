# Contributing bus data overrides

Most bus data comes from live feeds. These feeds often leave things out, such as the plate, model or build year. Some fleet numbers are only a guess. You can fix this with **overrides**: rows in [`data/changes.csv`](data/changes.csv) that correct or add details for a specific bus.

Every sync applies the file again, so a fix stays in place even when the feeds are pulled again.

## Quick start

1. Add a row to `data/changes.csv`.
2. Do a dry run and check the output:
   ```sh
   bun run sync
   ```
3. Fix any warnings it prints.
4. Open a pull request. Leave out `--apply`; the maintainer writes changes to the database.

## How a row works

Each row has two kinds of columns:

- **Match columns** pick the bus.
- **Value columns** set fields on that bus.

Fill in only the columns you need and leave the rest empty.

### Match columns

| Column | Matches |
|---|---|
| `feed_id` | The feed the bus comes from, such as `se-ul` (see the [feed list](#feed-ids)) |
| `match_fleet` | The fleet number on the bus |
| `match_plate` | The number plate |
| `match_vehicle_id` | The vehicle ID used by the live feed |
| `bus_id` | The site's own ID, from the bus page address (`/en/bus/1576` is `1576`) |

- A bus must match **every** match column you fill in.
- Matching ignores spaces, dashes and letter case, so `ABC 123` and `abc123` are the same.
- `feed_id` + `match_fleet` is usually the best combination. Fleet numbers repeat between operators, and sometimes within one feed.

If a row matches **no bus** or **more than one bus**, it is skipped with a warning. Add another match column to narrow it down, or use `bus_id`.

### Value columns

| Column | Format | Example |
|---|---|---|
| `fleet_number` | Number painted on the bus | `452` |
| `plate` | As written on the plate | `ABC 12D` |
| `operator_name` | Company running the bus | `Gamla Uppsala Buss` |
| `make` | Manufacturer | `MAN` |
| `model` | Model name | `Lion's City 18G` |
| `body` | Bodywork, if different from the make | `Alexander Dennis Enviro400` |
| `year_built` | Four-digit year | `2020` |
| `first_registered` | `YYYY-MM` or `YYYY-MM-DD` | `2020-03` |
| `fuel` | Fuel or drivetrain | `Biogas`, `Electric`, `Diesel` |
| `colour` | Main colour or livery | `Green` |
| `status` | `active`, `withdrawn` or `unknown` | `withdrawn` |
| `country` | `SE`, `GB`, `AU` or `NZ` | `SE` |

- An **empty cell** leaves that field as it is.
- A single **`-`** clears the field.
- Setting `fleet_number` marks it as confirmed. Swedish fleet numbers that were guessed from feed IDs show as "probable" until someone confirms them this way.

Put a value in double quotes if it contains a comma. Write a double quote inside a value as `""`.

## Examples

Add the model and build year to a bus in Uppsala:

```csv
feed_id,match_fleet,make,model,year_built
se-ul,452,MAN,Lion's City 18G,2020
```

Confirm a guessed fleet number by setting it to the same value:

```csv
feed_id,match_fleet,fleet_number
se-sl,4810,4810
```

Give a Swedish bus a plate, matching on the feed's vehicle ID:

```csv
feed_id,match_vehicle_id,plate
se-ul,9031003000500452,ABC 12D
```

Clear a wrong colour:

```csv
bus_id,colour
1576,-
```

The file has one header row for all columns, so leave unused columns empty:

```csv
feed_id,match_fleet,match_plate,match_vehicle_id,bus_id,fleet_number,plate,operator_name,make,model,body,year_built,first_registered,fuel,colour,status
se-ul,452,,,,,,,MAN,Lion's City 18G,,2020,,Biogas,Green,
```

## Reading the dry run

`bun run sync` shows each fix as `field: old → new`, then any warnings, then totals. Before opening a pull request, check that:

- each of your rows appears under **Fixes from the changes file**, or as "already up to date";
- none of your rows appear under **Warnings**.

Use `bun run sync se-ul` to pull only the feed you're working on. It's faster.

## Where data can come from

Only add facts you can check, for example:

- what you can see on the bus itself: fleet number, plate, make and livery;
- the operator's or transport authority's own published information;
- photos with a clear date and source, such as Wikimedia Commons.

Don't copy other sites' fleet lists or databases in bulk, because they may be copyrighted or their terms may forbid it. Don't add anything about drivers or passengers.

If you aren't sure about a value, leave it out. A missing field is better than a wrong one.

## Feed IDs

| Feed ID | Area |
|---|---|
| `se-sl` | Stockholm (SL) |
| `se-ul` | Uppsala (UL) |
| `se-otraf` | Östergötland (Östgötatrafiken) |
| `se-skane` | Skåne (Skånetrafiken) |
| `se-klt` | Kalmar (Kalmar länstrafik) |
| `se-varm` | Värmland (Värmlandstrafik) |
| `se-xt` | Gävleborg (X-trafik) |
| `se-dt` | Dalarna (Dalatrafik) |
| `se-orebro` | Örebro (Länstrafiken Örebro) |
| `se-jlt` | Jönköping (Jönköpings länstrafik) |
| `gb-bods` | England (Bus Open Data Service) |
| `au-tfnsw` | New South Wales |
| `au-translink` | South East Queensland |
| `au-ptv` | Victoria |
| `nz-at` | Auckland |
| `nz-metlink` | Wellington |
| `nz-metro-chc` | Christchurch |

To change one bus, you can also use **Suggest a correction** on its page on the site. Use this file when you have several buses to fix at once, or when a fix should be reviewed in a pull request.
