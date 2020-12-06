import fs from "fs";
import { Response } from 'express';
import axios from 'axios';

const readExistingFile = (filePath: string): any => {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return false;

    const jsonData = JSON.parse(data);

    if (!jsonData) return false;

    const { lastUpdated } = jsonData;

    if (!lastUpdated) return false;

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdated;
    const oneDay = 86400;

    if (timeSinceLastUpdate < oneDay) {
      return jsonData
    }
    return false;
  });
}

const timeStampData = (data: any) => {
  const lastUpdated = Date.now();
  return {
    lastUpdated,
    ...data,
  }
};

const getData = async (url: string, token: string, res: Response) => {
  try {
    const { data } = await axios({
      method: 'get',
      url,
      headers: { Authorization: 'Bearer ' + token }
    })
    return timeStampData(data);
  } catch (error) {
    res.json(error);
    return;
  }
}

export {
  readExistingFile,
  getData
}
