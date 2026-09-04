const fs = require('fs');
let code = fs.readFileSync('src/repositories/AttendanceRepository.ts', 'utf8');

code = code.replace(
  'import { collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp, orderBy, limit, getDoc, runTransaction, GeoPoint } from "firebase/firestore";',
  'import { collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp, orderBy, limit, getDoc, runTransaction, GeoPoint, writeBatch } from "firebase/firestore";'
);

fs.writeFileSync('src/repositories/AttendanceRepository.ts', code);
