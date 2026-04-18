import { Router } from "express";
import pageRoutes from "@/routes/page.route";
import userRoutes from "@/routes/user.route";
import postRoutes from "@/routes/post.route";
import healthRoute from "@/routes/health.route";
import schRoute from "@/routes/schedular.route";

const router = Router();

router.use("/", pageRoutes);
router.use("/schdular", schRoute);
router.use("/api/users", userRoutes);
router.use("/api/posts", postRoutes);
router.use("/health", healthRoute);

export default router;
