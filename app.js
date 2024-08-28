const express = require('express')
const app = express()
app.use(express.json())

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running...')
    })
  } catch (e) {
    console.log(`DB ERROR: ${e.message}`)
    process.exit(0)
  }
}

initializeDbAndServer()

const authenicaticationToken = async (request, response, next) => {
  let jwtToken
  const {tweet} = request.body
  const {tweetId} = request.params
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'dkfhkjhsdkhf', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.payload = payload
        request.tweetId = tweetId
        request.tweet = tweet
        next()
      }
    })
  }
}

//Register API
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const selectUserQuery = `
    SELECT 
        * 
    FROM 
        user 
    WHERE 
        username = "${username}";`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    const isPasswordLengthMoreThan6 = password.length
    if (isPasswordLengthMoreThan6 < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const postQuery = `
            INSERT INTO 
                user (username,password,name,gender)
            VALUES(
                "${username}",
                "${hashedPassword}",
                "${name}",
                "${gender}"
            );`
      await db.run(postQuery)
      response.send('User created successfully')
    }
  }
})

//Login API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  console.log(request.body)
  const selectUserQuery = `
  SELECT 
        * 
    FROM 
        user 
    WHERE 
        username = "${username}";`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const jwtToken = await jwt.sign(dbUser, 'dkfhkjhsdkhf')
      response.send({jwtToken: jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//get feed API
app.get(
  '/user/tweets/feed/',
  authenicaticationToken,
  async (request, response) => {
    const {payload} = request
    const {user_id, name, username, gender} = payload
    const getFeedsQuery = `
  SELECT 
    username ,
    tweet,
    date_time as dateTime 
  FROM 
    follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN user ON user.user_id = follower.following_user_id 
  WHERE 
    follower.follower_user_id = ${user_id} 
  ORDER BY
            date_time DESC
  LIMIT 4;`
    const tweetsArray = await db.all(getFeedsQuery)
    response.send(tweetsArray)
  },
)

//get user following API
app.get(
  '/user/following/',
  authenicaticationToken,
  async (request, response) => {
    const {payload} = request
    const {user_id, name, username, gender} = payload
    const getFollowingQuery = `
    SELECT 
      name
    FROM 
      user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id = ${user_id} ;`
    const followingArray = await db.all(getFollowingQuery)
    response.send(followingArray)
  },
)

app.get(
  '/user/followers/',
  authenicaticationToken,
  async (request, response) => {
    const {payload} = request
    const {user_id, name, username, gender} = payload
    const getFollowerQuery = `
  SELECT 
    name 
  FROM 
    user INNER JOIN follower ON user.user_id = follower.follower_user_id 
  WHERE 
    follower.following_user_id = ${user_id};`
    const followerArray = await db.all(getFollowerQuery)
    response.send(followerArray)
  },
)

//Get tweet API
app.get(
  '/tweets/:tweetId',
  authenicaticationToken,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload
    const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`
    const tweetsResult = await db.get(tweetsQuery)
    // response.send(tweetsResult)

    const userFollowersQuery = `
        SELECT 
           *

        FROM  follower INNER JOIN user ON user.user_id = follower.following_user_id 
       
        WHERE 
            follower.follower_user_id  = ${user_id} 
    ;`

    const userFollowers = await db.all(userFollowersQuery)

    if (
      userFollowers.some(
        item => item.following_user_id === tweetsResult.user_id,
      )
    ) {
      console.log(tweetsResult)
      console.log('-----------')
      console.log(userFollowers)

      const getTweetDetailsQuery = `
            SELECT
                tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                tweet.tweet_id = ${tweetId} AND tweet.user_id=${userFollowers[0].user_id}
            ;`

      const tweetDetails = await db.get(getTweetDetailsQuery)
      response.send(tweetDetails)
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//Get tweedId likes API
app.get(
  '/tweets/:tweetId/likes',
  authenicaticationToken,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload
    console.log(name, tweetId)
    const getLikedUsersQuery = `
            SELECT 
               *
            FROM 
                follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id 
                INNER JOIN user ON user.user_id = like.user_id
            WHERE 
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
    ;`
    const likedUsers = await db.all(getLikedUsersQuery)
    console.log(likedUsers)
    if (likedUsers.length !== 0) {
      let likes = []
      const getNamesArray = likedUsers => {
        for (let item of likedUsers) {
          likes.push(item.username)
        }
      }
      getNamesArray(likedUsers)
      response.send({likes})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//get tweetId replies API
app.get(
  '/tweets/:tweetId/replies',
  authenicaticationToken,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload
    console.log(name, tweetId)
    const getRepliedUsersQuery = `
            SELECT 
               *
            FROM 
                follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
                INNER JOIN user ON user.user_id = reply.user_id
            WHERE 
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
        ;`
    const repliedUsers = await db.all(getRepliedUsersQuery)
    console.log(repliedUsers)

    if (repliedUsers.length !== 0) {
      let replies = []
      const getNamesArray = repliedUsers => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          }
          replies.push(object)
        }
      }
      getNamesArray(repliedUsers)
      response.send({replies})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//Get user tweets API
app.get('/user/tweets', authenicaticationToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name, user_id)
  const getTweetsDetailsQuery = `
            SELECT
               tweet.tweet AS tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                user.user_id = ${user_id}
            GROUP BY
                tweet.tweet_id
            ;`

  const tweetsDetails = await db.all(getTweetsDetailsQuery)
  response.send(tweetsDetails)
})

//crate tweet API
app.post('/user/tweets', authenicaticationToken, async (request, response) => {
  const {tweet} = request
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name, tweetId)

  const postTweetQuery = `
        INSERT INTO 
            tweet (tweet, user_id)
        VALUES(
            '${tweet}',
            ${user_id}
        )
    ;`
  await db.run(postTweetQuery)
  response.send('Created a Tweet')
})

//delete a tweet API
app.delete(
  '/tweets/:tweetId',
  authenicaticationToken,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload

    const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`
    const tweetUser = await db.all(selectUserQuery)
    if (tweetUser.length !== 0) {
      const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE 
            tweet.user_id =${user_id} AND tweet.tweet_id =${tweetId}
    ;`
      await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
