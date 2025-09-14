const dbPath = "sqlite://./tweets.sqlite"

const db = Bun.SQL(dbPath)

const res = await db`select * from tweets order by timestamp desc limit 50`

const set = res.map((x) => `https://x.com/${x.user.replace("@", "")}/status/${x.id}`)

console.log(set)

await Bun.write("./processet-tweets.json", JSON.stringify(set, null, 4))

