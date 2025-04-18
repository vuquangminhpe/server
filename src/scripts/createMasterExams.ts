import { MongoClient, ObjectId } from 'mongodb'
import { envConfig } from '../constants/config'

interface MasterExam {
  _id: ObjectId
  name: string
  description?: string
  exam_period?: string
  start_time?: Date
  end_time?: Date
  created_at: Date
  updated_at: Date
  teacher_id: ObjectId
}

const uri = envConfig.mongodb_url
const dbName = envConfig.db_name

async function createMasterExamsCollection() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db(dbName)

    // Check if master_exams collection already exists
    const collections = await db.listCollections().toArray()
    const collectionExists = collections.some((col) => col.name === 'master_exams')

    if (collectionExists) {
      console.log('master_exams collection already exists')
    } else {
      // Create the collection
      await db.createCollection('master_exams')
      console.log('Created master_exams collection')

      // Create indexes
      await db.collection('master_exams').createIndex({ name: 1 })
      await db.collection('master_exams').createIndex({ teacher_id: 1 })
      await db.collection('master_exams').createIndex({ created_at: 1 })
      console.log('Created indexes on master_exams collection')
    }

    // Group existing exams by title and teacher_id
    const existingExams = await db.collection('exams').find({}).toArray()

    // Group exams by their title prefix (everything before the "#" if it exists)
    const examGroups = new Map()

    for (const exam of existingExams) {
      // Extract the core title (everything before "#" and number)
      let coreTitle = exam.title
      const hashIndex = exam.title.lastIndexOf('#')

      if (hashIndex !== -1) {
        // Check if there's a number after the #
        const afterHash = exam.title.substring(hashIndex + 1).trim()
        if (/^\d+$/.test(afterHash)) {
          coreTitle = exam.title.substring(0, hashIndex).trim()
        }
      }

      // Create a key from title and teacher_id
      const key = `${coreTitle}::${exam.teacher_id.toString()}`

      if (!examGroups.has(key)) {
        examGroups.set(key, {
          title: coreTitle,
          teacher_id: exam.teacher_id,
          exams: []
        })
      }

      examGroups.get(key).exams.push(exam)
    }

    console.log(`Grouped ${existingExams.length} exams into ${examGroups.size} master exams`)

    // Create master exams and link existing exams
    let counter = 0

    for (const [, group] of examGroups) {
      // Create master exam
      const masterExam: MasterExam = {
        _id: new ObjectId(),
        name: group.title,
        description: `Auto-generated from ${group.exams.length} existing exams`,
        created_at: new Date(),
        updated_at: new Date(),
        teacher_id: group.teacher_id
      }

      // If we have start times, use the earliest as the master start time
      const startTimes = group.exams
        .filter((exam: { start_time: any }) => exam.start_time)
        .map((exam: { start_time: string | number | Date }) => new Date(exam.start_time))

      if (startTimes.length > 0) {
        masterExam.start_time = new Date(Math.min(...startTimes.map((d: { getTime: () => any }) => d.getTime())))
      }

      // Insert the master exam
      await db.collection('master_exams').insertOne(masterExam)

      // Update all the linked exams with the master_exam_id
      const updatePromises = group.exams.map((exam: { _id: any }) =>
        db.collection('exams').updateOne({ _id: exam._id }, { $set: { master_exam_id: masterExam._id } })
      )

      await Promise.all(updatePromises)
      counter++

      console.log(`Created master exam ${counter}/${examGroups.size}: ${masterExam.name}`)
    }

    console.log('Migration completed successfully')
  } catch (error) {
    console.error('Error during migration:', error)
  } finally {
    await client.close()
    console.log('Disconnected from MongoDB')
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  createMasterExamsCollection()
    .then(() => console.log('Migration script finished'))
    .catch((error) => console.error('Migration failed:', error))
}

export default createMasterExamsCollection
