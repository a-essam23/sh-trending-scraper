import { Schema, model } from "mongoose";

interface INovel {
  _id: string;
  id: string;
  title: string;
  rankings: { rank: number; on: number }[];
  link: string;
  author: string;
  genres: string[];
  cover: string;
}

const novelSchema = new Schema<INovel>(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    rankings: [
      {
        rank: { type: Number, required: true },
        on: { type: Number, required: true },
      },
    ],
    link: { type: String, required: true },
    author: { type: String, required: true },
    genres: [{ type: String, required: true }],
    cover: { type: String, required: true },
  },
  { timestamps: true }
);

const Novel = model("Novel", novelSchema);

export default Novel;
