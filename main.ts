import { config } from "dotenv";
config({ path: ".env" });
import fs from "fs";
import mongoose, { mongo } from "mongoose";
import Novel from "./models/novel-model";
import Options from "./models/options-model";
import { Builder, By, until } from "selenium-webdriver";

const browserType = "chrome";
export function connect(callback: () => any) {
  if (!process.env.DATABASE_URL) throw new Error("No database url");
  mongoose.connect(process.env.DATABASE_URL).catch((err) => {
    console.error(err);
    process.exit(1);
  });

  mongoose.connection.on("error", (err) => {
    console.error("Mongoose connection error", err);
  });
  // Execute the callback when the connection is established
  mongoose.connection.on("connected", () => {
    console.info("Connected to database");
    callback();
  });
}

interface INovel {
  _id: string;
  id: string;
  title: string;
  rankings: { rank: number; on: number }[];
  link: string;
  author: string;
  genres: string[];
  cover: string;
  top1: number;
  top10: number;
  top25: number;
  top100: number;
}

interface IScrapedNovel
  extends Omit<INovel, "rankings" | "top1" | "top10" | "top25" | "top100"> {
  ranking: number;
}

const uploadJSONtoDB = async () => {
  const { novels, updatedAt } = await getNovelsFromJSON();
  let c = 1;
  for (let novel of novels) {
    try {
      let novel_: any = { ...novel };
      delete novel_?._id;
      const doc = await Novel.create(novel_);
      console.log(`${novel.title} uploaded ${c}/${novels.length}`);
      c++;
    } catch (e) {
      console.log(e);
    }
  }
  const options = Options.create({ name: "main", lastUpdated: updatedAt });
  return;
};

const checkIfAlreadyUpdated = (updatedAt: number) => {
  const updatedAtDate = new Date(updatedAt);
  console.log(`Last scrape was at ${new Date(updatedAt).toLocaleString()}`);
  // Get the current date in UTC
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  // Create a Date object for 01:00 GMT of the current day
  const oneAMGMTToday = new Date(Date.UTC(year, month, day, 1, 0, 0));

  // Check if the script was run after 01:00 GMT of the current day
  if (updatedAtDate.getDay() === oneAMGMTToday.getDay()) {
    console.log(updatedAtDate.toString());
    console.log(oneAMGMTToday.toString());
    throw new Error("Last scrape was after trending updated today... exiting.");
  }
  if (Date.now() < oneAMGMTToday.getTime())
    throw new Error(
      "Trending updates at 00:00 GMT. It takes at least an hour to stabilize. Please try again later."
    );
  console.log("Last scrape was before trending updated... continuing...");
  return true;
};

const getNovelsFromJSON = async () => {
  console.log("Fetching novels from local...");
  let novelsObj: { updatedAt: number; novels: INovel[] } = {
    novels: [],
    updatedAt: 0,
  };
  if (fs.existsSync("./novels.json")) {
    console.log("Locally saved novels found, appending...");
    novelsObj = JSON.parse(fs.readFileSync("./novels.json").toString());
  } else {
    console.log("No novels saved locally.");
  }
  return novelsObj;
};

const updateUpdatedNow = async (date: number) => {
  const options = await Options.updateOne(
    { name: "main" },
    { lastUpdated: date }
  );
  return true;
};

const getNovelsFromDB = async () => {
  const novels = await Novel.find({});
  const options = await Options.findOne({ name: "main" });
  if (!options) throw new Error("No options found with name equal to main");
  return { updatedAt: options?.lastUpdated, novels };
};

const updateNovelToDB = async (
  novels: INovel[],
  scrapedNovel: IScrapedNovel,
  dateNow: number
) => {
  console.log(novels.length);
  let novelExists = novels.find((n) => n.id === scrapedNovel.id);
  let novel: INovel;
  if (novelExists) {
    const rank = scrapedNovel.ranking;
    let incStats: Record<string, number> = { top100: 1 };
    switch (true) {
      case rank === 1:
        incStats = { ...incStats, top1: 1 };
        break;
      case rank <= 10:
        incStats = { ...incStats, top10: 1 };
        break;
      case rank <= 25:
        incStats = { ...incStats, top25: 1 };
        break;
    }
    novelExists.rankings.push({ rank: scrapedNovel.ranking, on: dateNow });
    console.log(
      `${novelExists.title} was already been on trending before. Updaing...,`
    );
    const novelDoc = await Novel.findOneAndUpdate(
      { title: novelExists.title },
      {
        $push: { rankings: { rank: scrapedNovel.ranking, on: dateNow } },
        $inc: incStats,
      }
    );
  } else {
    const stats = { top1: 0, top10: 0, top25: 0, top100: 1 };
    const rank = +scrapedNovel.ranking;
    switch (true) {
      case rank === 1:
        stats.top1 = 1;
        break;
      case rank <= 10:
        stats.top10 = 1;
        break;
      case rank <= 25:
        stats.top25 = 1;
        break;
    }
    novel = {
      ...scrapedNovel,
      ...stats,
      rankings: [{ rank: scrapedNovel.ranking, on: dateNow }],
    };
    delete (novel as any).ranking;
    delete (novel as any)._id;
    novels.push(novel);
    console.log(
      `This is '${novel.title}' first time one trending. Adding to Database...`
    );
    const doc = await Novel.create(novel);
    novel._id = doc._id.toString();
    return novelExists;
  }
  return;
};

async function resetNovelsStats() {
  const noveldocs = await Novel.find({});
  const allPromises = noveldocs.map(async (novel) => {
    console.log(
      `Resetting stats for ${novel.title} with ${novel.rankings.length} entries`
    );
    let top1 = 0;
    let top10 = 0;
    let top25 = 0;
    let top100 = 0;
    const ranking = novel.rankings;
    for (let rank of ranking) {
      top100++;
      if (rank.rank === 1) {
        top1++;
        console.log(novel.top1);
        continue;
      }
      if (rank.rank <= 10) {
        top10++;
        continue;
      }
      if (rank.rank <= 25) {
        top25++;
        continue;
      }
    }
    novel.top1 = top1;
    novel.top10 = top10;
    novel.top25 = top25;
    novel.top100 = top100;
    await novel.save();
  });
  await Promise.all(allPromises);
}

async function scrapeWebsite(pages: number) {
  const novels: IScrapedNovel[] = [];

  try {
    let counter = 1;
    for (let page = 1; page < pages + 1; page++) {
      const driver = await new Builder().forBrowser(browserType).build();

      const url = `https://www.scribblehub.com/series-ranking/?sort=5&order=1&pg=${page}`;
      await driver.get(url);

      await driver.wait(
        until.elementLocated(By.className("wi_fic_wrap")),
        900 * 1000
      );

      const novelElements = await driver.findElements(
        By.className("search_main_box")
      );
      for (let novelElement of novelElements) {
        const titleElement = novelElement.findElement(
          By.className("search_title")
        );
        const titleHref = await titleElement.findElement(By.css("a"));
        const title = (await titleHref.getText()).replace("’", "'");
        const link = await titleHref.getAttribute("href");
        const ranking = +(
          await titleElement.findElement(By.className("genre_rank")).getText()
        ).replace("#", "");
        const id = (
          await titleElement.findElement(By.css("span")).getAttribute("id")
        ).replace("sid", "");

        const cover = await novelElement
          .findElement(By.css(".search_img img"))
          .getAttribute("src");

        const author = await novelElement
          .findElement(By.xpath(".//span[contains(@title,'Author')]"))
          .getText();
        const genreElements = await novelElement.findElements(
          By.css(".search_genre a")
        );
        const genres: string[] = [];
        for (let genreElement of genreElements) {
          genres.push(await genreElement.getText());
        }
        console.log(`Scraped ${counter}/100`);
        counter++;
        novels.push({
          _id: id,
          id,
          title,
          link,
          author,
          genres,
          ranking,
          cover,
        });
      }
      await driver.close();
    }
    return novels;
  } catch (error) {
    console.error("Error fetching the webpage:", error);
  }
}

const main = async () => {
  const dateNow = Date.now();
  console.log(`Running at ${new Date(dateNow).toLocaleString()}`);
  const novels = await getNovelsFromDB();
  checkIfAlreadyUpdated(novels.updatedAt);

  const scrapedNovels = await scrapeWebsite(4);
  if (!scrapedNovels) throw new Error("No new novels found");
  novels["updatedAt"] = dateNow;
  await updateUpdatedNow(dateNow);
  let counter = 1;
  for (let scrapedNovel of scrapedNovels) {
    console.log(`Working on ${scrapedNovel.title}`);
    await updateNovelToDB(novels["novels"], scrapedNovel, dateNow);
    console.log(`Updated ${counter}/100`);
    counter++;
  }
  fs.writeFileSync("./novels.json", JSON.stringify(novels));
};

const test = async () => {
  const noveldocs: INovel[] = await Novel.find({});
  const testDuplicates = () => {
    let duplicates = 0;
    noveldocs.map((novel) => {
      const rankings = novel.rankings;
      if (rankings.length < 2) return;
      console.log(
        `${novel.title} has ${rankings.length}: ${rankings
          .map(
            (rank) => `${rank.rank} on ${new Date(rank.on).toLocaleString()}`
          )
          .join(" and ")}`
      );
      let index = 0;
      for (let rank of rankings) {
        const rankingsWithoutRank = rankings.splice(index, 1);
        const similarRank = rankingsWithoutRank.find(
          (r) => r.rank === rank.rank
        );
        if (
          similarRank &&
          new Date(similarRank.on).getDay() === new Date(rank.on).getDay()
        )
          console.log(
            `${novel.title} has rank ${rank.rank} on ${new Date(
              rank.on
            ).getDate()} and ${similarRank.rank} on ${new Date(
              similarRank.on
            ).getDate()} duplicated!`
          );
        duplicates++;
        index++;
      }
    });
    console.log(duplicates);
  };

  const testAnyToday = async () => {
    let count = 0;
    noveldocs.map((novel) => {
      const rankings = novel.rankings;
      for (let rank of rankings) {
        const date = new Date(rank.on).getDate();
        if (date === new Date().getDate()) {
          console.log(
            `${novel.title} has rank ${rank.rank} on ${new Date(
              rank.on
            ).toLocaleString()}  `
          );
          count++;
          break;
        }
      }
    });
    console.log(`Found ${count} novels with rankings today`);
  };
  await testAnyToday();
};

connect(async () => {
  main()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((err) => {
      fs.appendFileSync("log.txt", `${Date.now()} ${err}` + "\n");
      process.exit(1);
    });
});