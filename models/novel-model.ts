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
  top1: number;
  top10: number;
  top25: number;
  top100: number;
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
    top1: { type: Number, default: 0 },
    top10: { type: Number, default: 0 },
    top25: { type: Number, default: 0 },
    top100: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Novel = model("Novel", novelSchema);

export default Novel;
