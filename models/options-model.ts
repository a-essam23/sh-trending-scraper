import { Schema, model } from "mongoose";

interface IOptions {
  name: string;
  lastUpdated: number;
}

const novelSchema = new Schema<IOptions>(
  {
    name: { type: String, required: true, unique: true },
    lastUpdated: { type: Number, required: true },
  },
  { timestamps: true }
);

const Options = model("Option", novelSchema);

export default Options;
