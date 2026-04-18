import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.send({ ok: true, message: "API is runnign!" });
});

export default router;
