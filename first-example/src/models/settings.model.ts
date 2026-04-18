import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    env: { type: String, require: true },
  },
  {
    timestamps: true,
  },
);

export const Settings = mongoose.model("setting", settingSchema);
