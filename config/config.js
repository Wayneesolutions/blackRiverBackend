import 'dotenv/config'

export const config = {
    PORT: process.env.PORT,
    DB_CLUSTER: process.env.DB,
    DB_LOCAL: process.env.DB1,
    USE_DB: process.env.NODE_ENV || "development",
  };
  