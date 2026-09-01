import { Router } from "express";

import {
  compareProductOptions,
  getProductById,
  getProducts,
  searchProductRecommendations,
} from "./product.controller";

const productRouter = Router();

productRouter.get("/", getProducts);
productRouter.post("/search", searchProductRecommendations);
productRouter.post("/compare", compareProductOptions);
productRouter.get("/:id", getProductById);

export default productRouter;
