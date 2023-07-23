import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import {
  graphql,
  validate,
  parse,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLInt,
  GraphQLEnumType,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLScalarType,
} from 'graphql';
import { UUIDType } from "./types/uuid.js";
import depthLimit from "graphql-depth-limit";
import DataLoader from "dataloader";

type UndefinableType<T> = undefined | T;

enum MemberTypeIdEnum {
  BASIC = 'basic',
  BUSINESS = 'business'
}

interface IMemberType {
  id: string;
  discount: number;
  postsLimitPerMonth: number;
}

interface IPost {
  id: string;
  title: string;
  content: string;
  authorId: number;
}

interface IProfile {
  id: string;
  isMale: boolean;
  yearOfBirth: number;
  memberTypeId: MemberTypeIdEnum;
  userId: string;
}

interface ISubscription {
  subscriberId: string;
  authorId: string;
}

interface IUser {
  id: string;
  name: string;
  balance: number;
  memberType: IMemberType;
  userId: string;
  profile?: IProfile;
  posts: Array<IPost>;
  userSubscribedTo: Array<ISubscription>;
  subscribedToUser: Array<ISubscription>;
}

interface IRootQuery {
  memberTypes: Array<IMemberType>;
  memberType: IMemberType;
  posts: Array<IPost>;
  post: IPost;
  profiles: Array<IProfile>;
  profile: IProfile;
  users: Array<IUser>;
  user: IUser;
}

interface IResolversContext {
  userLoader: DataLoader<string, IUser, string>;
  postLoader: DataLoader<string, IPost, string>;
  profileLoader: DataLoader<string, IProfile, string>;
  memberTypeLoader: DataLoader<string, IMemberType, string>;
  userSubscribedToLoader: DataLoader<string, IUser, string>;
  subscribedToUserLoader: DataLoader<string, IUser, string>;
}

export interface IObjectOfObjects<T> {
  [key: string]: T;
}

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  const userLoader = new DataLoader(async (keys: readonly string[]): Promise<Array<IUser>> => {
    const users = await prisma.user.findMany();
    const cache: IObjectOfObjects<IUser> = keys.reduce((accumulator, key) => {
      accumulator[key] = users.find((user) => user.id === key);
      return accumulator;
    }, {});
    return keys.map((key) => cache[key]);
  });

  const postLoader = new DataLoader(async (keys: readonly string[]): Promise<Array<IPost>> => {
    const posts = await prisma.post.findMany();
    const cache: IObjectOfObjects<IPost> = keys.reduce((accumulator, key) => {
      accumulator[key] = posts.filter((post) => post.authorId === key);
      return accumulator;
    }, {});
    return keys.map((key) => cache[key]);
  });

  const profileLoader = new DataLoader(async (keys: readonly string[]): Promise<Array<IProfile>> => {
    const profiles = await prisma.profile.findMany();
    const cache: IObjectOfObjects<IProfile> = keys.reduce((accumulator, key) => {
      accumulator[key] = profiles.find((profile) => profile.userId === key);
      return accumulator;
    }, {});
    return keys.map((key) => cache[key]);
  });

  const memberTypeLoader = new DataLoader(async (keys: readonly string[]): Promise<Array<IMemberType>> => {
    const memberTypes = await prisma.memberType.findMany();
    const cache: IObjectOfObjects<IMemberType> = keys.reduce((accumulator, key) => {
      accumulator[key] = memberTypes.find((memberType) => memberType.id === key);
      return accumulator;
    }, {});
    return keys.map((key) => cache[key]);
  });

  const userSubscribedToLoader = new DataLoader(async (keys: readonly string[]): Promise<Array<IUser>> => {
    const usersWithSubscriptions = await prisma.user.findMany({ include: { subscribedToUser: true, userSubscribedTo: true } });
    const cache: IObjectOfObjects<IUser> = keys.reduce((accumulator, key) => {
      accumulator[key] = usersWithSubscriptions.filter((subscription) => subscription.subscribedToUser.some((sub) => sub.subscriberId === key));
      return accumulator;
    }, {});
    return keys.map((key) => cache[key]);
  });

  const subscribedToUserLoader = new DataLoader(async (keys: readonly string[]): Promise<Array<IUser>> => {
    const usersWithSubscriptions = await prisma.user.findMany({ include: { subscribedToUser: true, userSubscribedTo: true } });
    const cache: IObjectOfObjects<IUser> = keys.reduce((accumulator, key) => {
      accumulator[key] = usersWithSubscriptions.filter((subscription) => subscription.userSubscribedTo.some((sub) => sub.authorId === key));
      return accumulator;
    }, {});
    return keys.map((key) => cache[key]);
  });

  const MemberTypeId = new GraphQLEnumType({
    name: 'MemberTypeId',
    values: {
      'basic': {
        value: MemberTypeIdEnum.BASIC
      },
      'business': {
        value: MemberTypeIdEnum.BUSINESS
      }
    }
  });

  const MemberType = new GraphQLObjectType<IMemberType>({
    name: 'MemberType',
    fields: {
      id: { type: MemberTypeId },
      discount: { type: GraphQLFloat },
      postsLimitPerMonth: { type: GraphQLInt },
    }
  });

  const PostType = new GraphQLObjectType<IPost>({
    name: 'PostType',
    fields: {
      id: { type: UUIDType },
      title: { type: GraphQLString },
      content: { type: GraphQLString },
      authorId: { type: UUIDType },
    }
  });

  const ProfileType = new GraphQLObjectType<IProfile>({
    name: 'ProfileType',
    fields: {
      id: { type: UUIDType },
      isMale: { type: GraphQLBoolean },
      yearOfBirth: { type: GraphQLInt },
      memberType: {
        type: MemberType, async resolve(parent: IProfile, _, context: IResolversContext) {
          const { memberTypeLoader } = context;
          return await memberTypeLoader.load(parent.memberTypeId);
        }
      }
    }
  });

  const UserType = new GraphQLObjectType<IUser>({
    name: 'UserType',
    fields: () => ({
      id: { type: UUIDType },
      name: { type: GraphQLString },
      balance: { type: GraphQLFloat },
      profile: {
        type: ProfileType, async resolve(parent: IUser, _, context: IResolversContext) {
          const { profileLoader } = context;
          return await profileLoader.load(parent.id);
        }
      },
      posts: {
        type: new GraphQLList(PostType), async resolve(parent: IUser, _, context: IResolversContext) {
          const { postLoader } = context;
          return await postLoader.load(parent.id);
        }
      },
      userSubscribedTo: {
        type: new GraphQLList(UserType), async resolve(parent: IUser, _, context: IResolversContext) {
          const { userSubscribedToLoader } = context;
          return await userSubscribedToLoader.load(parent.id);
        }
      },
      subscribedToUser: {
        type: new GraphQLList(UserType), async resolve(parent: IUser, _, context: IResolversContext) {
          const { subscribedToUserLoader } = context;
          return await subscribedToUserLoader.load(parent.id);
        }
      },
    })
  });

  const RootQueryType = new GraphQLObjectType<IRootQuery>({
    name: 'RootQueryType',
    fields: {
      memberTypes: {
        type: new GraphQLList(MemberType),
        async resolve() {
          return await prisma.memberType.findMany();
        }
      },
      memberType: {
        type: MemberType,
        args: { id: { type: MemberTypeId } },
        async resolve(_, args: { id: string }) {
          return await prisma.memberType.findUnique({ where: { id: args.id } });
        }
      },
      posts: {
        type: new GraphQLList(PostType),
        async resolve() {
          return await prisma.post.findMany();
        }
      },
      post: {
        type: PostType,
        args: { id: { type: UUIDType } },
        async resolve(_, args: { id: string }) {
          return await prisma.post.findUnique({ where: { id: args.id } });
        }
      },
      profiles: {
        type: new GraphQLList(ProfileType),
        async resolve() {
          return await prisma.profile.findMany();
        }
      },
      profile: {
        type: ProfileType,
        args: { id: { type: UUIDType } },
        async resolve(_, args: { id: string }) {
          return await prisma.profile.findUnique({ where: { id: args.id } });
        }
      },
      users: {
        type: new GraphQLList(UserType),
        async resolve() {
          return await prisma.user.findMany();
        }
      },
      user: {
        type: UserType as GraphQLObjectType<IUser>,
        args: { id: { type: UUIDType } },
        async resolve(_, args: { id: string, userWithNullProfileId: UndefinableType<string> }, context: IResolversContext) {
          const { id, userWithNullProfileId } = args;
          if (userWithNullProfileId) return { userWithNullProfileId: null };
          const { userLoader } = context;
          return await userLoader.load(id);
        }
      },
    },
  });

  interface ICreateUserData {
    name: string;
    balance: number;
  }

  interface IChangeUserData {
    name?: string;
    balance?: number;
  }

  interface ICreatePostData {
    authorId: string;
    content: string;
    title: string;
  }

  interface IChangePostData {
    content?: string;
    title?: string;
  }

  interface ICreateProfileData {
    userId: string;
    memberTypeId: MemberTypeIdEnum;
    isMale: boolean;
    yearOfBirth: number;
  }

  interface IChangeProfileData {
    memberTypeId?: MemberTypeIdEnum;
    isMale?: boolean;
    yearOfBirth?: number;
  }

  const CreateUserInput = new GraphQLScalarType({
    name: 'CreateUserInput',
    serialize(value) {
      const createUserData = value as ICreateUserData;
      return typeof createUserData.name !== 'string' &&
        typeof createUserData.balance !== 'number' ?
        null
        : value;
    },
    parseValue(value) {
      const createUserData = value as ICreateUserData;
      return typeof createUserData.name !== 'string' &&
        typeof createUserData.balance !== 'number' ?
        null
        : value;
    },
  });

  const ChangeUserInput = new GraphQLScalarType({
    name: 'ChangeUserInput',
    serialize(value) {
      const changeUserData = value as IChangeUserData;
      return typeof changeUserData.name !== 'string' &&
        typeof changeUserData.balance !== 'number' ?
        null
        : value;
    },
    parseValue(value) {
      const changeUserData = value as IChangeUserData;
      return typeof changeUserData.name !== 'string' &&
        typeof changeUserData.balance !== 'number' ?
        null
        : value;
    },
  });

  const CreatePostInput = new GraphQLScalarType({
    name: 'CreatePostInput',
    serialize(value) {
      const createPostData = value as ICreatePostData;
      return typeof createPostData.authorId !== 'string' &&
        typeof createPostData.title !== 'string' &&
        typeof createPostData.content !== 'number' ?
        null
        : value;
    },
    parseValue(value) {
      const createPostData = value as ICreatePostData;
      return typeof createPostData.authorId !== 'string' &&
        typeof createPostData.title !== 'string' &&
        typeof createPostData.content !== 'number' ?
        null
        : value;
    },
  });

  const ChangePostInput = new GraphQLScalarType({
    name: 'ChangePostInput',
    serialize(value) {
      const changePostData = value as IChangePostData;
      const createPostData = value as ICreatePostData;
      if (createPostData.authorId) {
        throw new Error(
          "Field \"authorId\" is not defined by type \"ChangePostInput\"",
        );
      }

      return typeof changePostData.title !== 'string' &&
        typeof changePostData.content !== 'number' ?
        null
        : value;
    },
    parseValue(value) {
      const changePostData = value as IChangePostData;
      const createPostData = value as ICreatePostData;
      if (createPostData.authorId) {
        throw new Error(
          "Field \"authorId\" is not defined by type \"ChangePostInput\"",
        );
      }

      return typeof changePostData.title !== 'string' &&
        typeof changePostData.content !== 'number' ?
        null
        : value;
    },
  });

  const CreateProfileInput = new GraphQLScalarType({
    name: 'CreateProfileInput',
    serialize(value) {
      const createProfileData = value as ICreateProfileData;
      if (!Number.isInteger(createProfileData.yearOfBirth)) {
        throw new Error(
          `Int cannot represent non-integer value: ${createProfileData.yearOfBirth}`,
        );
      }

      return typeof createProfileData.userId !== 'string' &&
        (createProfileData.memberTypeId !== MemberTypeIdEnum.BASIC &&
          createProfileData.memberTypeId !== MemberTypeIdEnum.BUSINESS) &&
        typeof createProfileData.yearOfBirth !== 'number' &&
        typeof createProfileData.isMale !== 'boolean' ?
        null
        : value;
    },
    parseValue(value) {
      const createProfileData = value as ICreateProfileData;
      if (!Number.isInteger(createProfileData.yearOfBirth)) {
        throw new Error(
          `Int cannot represent non-integer value: ${createProfileData.yearOfBirth}`,
        );
      }

      return typeof createProfileData.userId !== 'string' &&
        (createProfileData.memberTypeId !== MemberTypeIdEnum.BASIC &&
          createProfileData.memberTypeId !== MemberTypeIdEnum.BUSINESS) &&
        typeof createProfileData.yearOfBirth !== 'number' &&
        typeof createProfileData.isMale !== 'boolean' ?
        null
        : value;
    },
  });

  const ChangeProfileInput = new GraphQLScalarType({
    name: 'ChangeProfileInput',
    serialize(value) {
      const changeProfileData = value as IChangeProfileData;
      const createProfileData = value as ICreateProfileData;
      if (createProfileData.userId) {
        throw new Error(
          "Field \"userId\" is not defined by type \"ChangeProfileInput\"",
        );
      }
      if (changeProfileData.yearOfBirth && !Number.isInteger(changeProfileData.yearOfBirth)) {
        throw new Error(
          `Int cannot represent non-integer value: ${changeProfileData.yearOfBirth}`,
        );
      }

      return (changeProfileData.memberTypeId !== MemberTypeIdEnum.BASIC &&
        changeProfileData.memberTypeId !== MemberTypeIdEnum.BUSINESS) &&
        typeof changeProfileData.yearOfBirth !== 'number' &&
        typeof changeProfileData.isMale !== 'boolean' ?
        null
        : value;
    },
    parseValue(value) {
      const changeProfileData = value as IChangeProfileData;
      const createProfileData = value as ICreateProfileData;
      if (createProfileData.userId) {
        throw new Error(
          "Field \"userId\" is not defined by type \"ChangeProfileInput\"",
        );
      }
      if (changeProfileData.yearOfBirth && !Number.isInteger(changeProfileData.yearOfBirth)) {
        throw new Error(
          `Int cannot represent non-integer value: ${changeProfileData.yearOfBirth}`,
        );
      }

      return (changeProfileData.memberTypeId !== MemberTypeIdEnum.BASIC &&
        changeProfileData.memberTypeId !== MemberTypeIdEnum.BUSINESS) &&
        typeof changeProfileData.yearOfBirth !== 'number' &&
        typeof changeProfileData.isMale !== 'boolean' ?
        null
        : value;
    },
  });

  const CreateUserType = new GraphQLObjectType({
    name: 'CreateUserType',
    fields: {
      id: {
        type: UUIDType,
      }
    }
  });

  const SubscribeToType = new GraphQLObjectType({
    name: 'SubscribeToType',
    fields: {
      id: {
        type: UUIDType,
      }
    }
  });

  const CreatePostType = new GraphQLObjectType({
    name: 'CreatePostType',
    fields: {
      id: {
        type: UUIDType,
      }
    }
  });

  const CreateProfileType = new GraphQLObjectType({
    name: 'CreateProfileType',
    fields: {
      id: {
        type: UUIDType,
      }
    }
  });

  const ChangeUserType = new GraphQLObjectType({
    name: 'ChangeUserType',
    fields: {
      id: {
        type: UUIDType,
      }
    }
  });

  const ChangePostType = new GraphQLObjectType({
    name: 'ChangePostType',
    fields: {
      id: {
        type: UUIDType,
      }
    }
  });

  const ChangeProfileType = new GraphQLObjectType({
    name: 'ChangeProfileType',
    fields: {
      id: {
        type: UUIDType,
      }
    }
  });

  const RootMutationType = new GraphQLObjectType({
    name: 'RootMutationType',
    fields: {
      createUser: {
        type: CreateUserType,
        args: { dto: { type: CreateUserInput } },
        async resolve(_, args: { dto: ICreateUserData }) {
          const { dto: { name, balance } } = args;
          return await prisma.user.create({ data: { name, balance } });
        }
      },
      createPost: {
        type: CreatePostType,
        args: { dto: { type: CreatePostInput } },
        async resolve(_, args: { dto: ICreatePostData }) {
          const { dto: { authorId, title, content } } = args;
          return await prisma.post.create({ data: { authorId, title, content } });
        }
      },
      createProfile: {
        type: CreateProfileType,
        args: { dto: { type: CreateProfileInput } },
        async resolve(_, args: { dto: ICreateProfileData }) {
          const { dto: { userId, memberTypeId, isMale, yearOfBirth } } = args;
          return await prisma.profile.create({ data: { userId, memberTypeId, isMale, yearOfBirth } });
        }
      },
      deleteUser: {
        type: GraphQLString,
        args: { id: { type: UUIDType } },
        async resolve(_, args: { id: string }) {
          const { id } = args;
          await prisma.user.delete({ where: { id } });
        }
      },
      deletePost: {
        type: GraphQLString,
        args: { id: { type: UUIDType } },
        async resolve(_, args: { id: string }) {
          const { id } = args;
          await prisma.post.delete({ where: { id } });
        }
      },
      deleteProfile: {
        type: GraphQLString,
        args: { id: { type: UUIDType } },
        async resolve(_, args: { id: string }) {
          const { id } = args;
          await prisma.profile.delete({ where: { id } });
        }
      },
      changeUser: {
        type: ChangeUserType,
        args: { id: { type: UUIDType }, dto: { type: ChangeUserInput } },
        async resolve(_, args: { id: string, dto: IChangeUserData }) {
          const { id, dto: { name, balance } } = args;
          return await prisma.user.update({ where: { id }, data: { name, balance } });
        }
      },
      changePost: {
        type: ChangePostType,
        args: { id: { type: UUIDType }, dto: { type: ChangePostInput } },
        async resolve(_, args: { id: string, dto: IChangePostData }) {
          const { id, dto: { content, title } } = args;
          return await prisma.post.update({ where: { id }, data: { content, title } });
        }
      },
      changeProfile: {
        type: ChangeProfileType,
        args: { id: { type: UUIDType }, dto: { type: ChangeProfileInput } },
        async resolve(_, args: { id: string, dto: IChangeProfileData }) {
          const { id, dto: { isMale, memberTypeId, yearOfBirth } } = args;
          return await prisma.profile.update({ where: { id }, data: { isMale, memberTypeId, yearOfBirth } });
        }
      },
      subscribeTo: {
        type: SubscribeToType,
        args: { userId: { type: UUIDType }, authorId: { type: UUIDType } },
        async resolve(_, args: { userId: string, authorId: string }) {
          const { userId, authorId } = args;
          return await prisma.subscribersOnAuthors.create({ data: { subscriberId: userId, authorId } });
        }
      },
      unsubscribeFrom: {
        type: GraphQLString,
        args: { userId: { type: UUIDType }, authorId: { type: UUIDType } },
        async resolve(_, args: { userId: string, authorId: string }) {
          const { userId, authorId } = args;
          await prisma.subscribersOnAuthors.deleteMany({ where: { subscriberId: userId, authorId } });
        }
      },
    }
  });

  const schema = new GraphQLSchema({
    query: RootQueryType,
    mutation: RootMutationType
  });

  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      ...createGqlResponseSchema,
      response: {
        200: gqlResponseSchema,
      },
    },
    async handler(request) {
      const validationErrors = validate(schema, parse(request.body.query), [depthLimit(5)]);
      return validationErrors.length ?
        { errors: validationErrors }
        : await graphql({
          schema,
          source: request.body.query,
          variableValues: request.body.variables,
          contextValue: {
            userLoader,
            postLoader,
            profileLoader,
            memberTypeLoader,
            userSubscribedToLoader,
            subscribedToUserLoader,
          }
        });
    },
  });
};

export default plugin;
