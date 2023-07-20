import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import {
  graphql,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLInt,
  GraphQLEnumType,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';
import { UUIDType } from "./types/uuid.js";

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
  memberType: IMemberType;
  userId: string;
}

interface IUser {
  id: string;
  name: string;
  balance: number;
  memberType: IMemberType;
  userId: string;
  profile?: IProfile;
  posts: Array<IPost>;
  userSubscribedTo: Array<IUser>;
  subscribedToUser: Array<IUser>;
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

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;
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
        type: MemberType, async resolve(parent: IProfile) {
          const foundProfile = await prisma.profile.findUnique({ where: { userId: parent.userId } });
          return await prisma.memberType.findUnique({ where: { id: foundProfile?.memberTypeId } });
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
        type: ProfileType, async resolve(parent: IUser) {
          return await prisma.profile.findUnique({ where: { userId: parent.id } })
        }
      },
      posts: {
        type: new GraphQLList(PostType), async resolve(parent: IUser) {
          return await prisma.post.findMany({ where: { authorId: parent.id } })
        }
      },
      userSubscribedTo: {
        type: new GraphQLList(UserType), async resolve(parent: IUser) {
          return await prisma.user.findMany({
            where: {
              subscribedToUser: {
                some: {
                  subscriberId: parent.id,
                },
              },
            },
          });
        }
      },
      subscribedToUser: {
        type: new GraphQLList(UserType), async resolve(parent: IUser) {
          return await prisma.user.findMany({
            where: {
              userSubscribedTo: {
                some: {
                  authorId: parent.id,
                },
              },
            },
          });
        }
      },
    })
  });

  const RootQueryType = new GraphQLObjectType<IRootQuery>({
    name: 'RootQueryType',
    fields: () => ({
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
        async resolve(_, args: { id: string, userWithNullProfileId: UndefinableType<string> }) {
          if (args.userWithNullProfileId) return { userWithNullProfileId: null };
          return await prisma.user.findUnique({ where: { id: args.id } });
        }
      },
    }),
  });

  const schema = new GraphQLSchema({
    query: RootQueryType,
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
      return await graphql({
        schema,
        source: request.body.query,
        variableValues: request.body.variables,
      });
    },
  });
};

export default plugin;
